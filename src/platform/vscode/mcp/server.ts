import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import type { MindFlowEditorBridge } from "../../mcp/protocol/bridge";
import { MindFlowMcpProtocol } from "../../mcp/protocol/jsonRpcProtocol";
import { MINDFLOW_STDIO_PROXY_RELATIVE_PATH } from "../../mcp/protocol/stdioProxyPath";
import { MindFlowMcpToolHandlers } from "../../mcp/tools";

const MAX_MCP_REQUEST_BODY_BYTES = 10 * 1024 * 1024;

export interface MindFlowMcpSession {
  endpoint: string;
  port: number;
  token: string;
  pid: number;
  createdAt: string;
  lastSeenAt: string;
  workspaceRoots: string[];
  extensionVersion: string;
  sessionPath: string;
  stdioCommand: string;
  stdioArgs: string[];
}

export class MindFlowMcpServerManager implements vscode.Disposable {
  private server: http.Server | undefined;
  private session: MindFlowMcpSession | undefined;
  private startPromise: Promise<void> | undefined;
  private startError: string | undefined;
  private disposed = false;
  private readonly sessionId = randomUUID();
  private sessionFilePath: string | undefined;
  private lastRegistryWrite = 0;
  private readonly protocols = new Map<string, MindFlowMcpProtocol>();

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly bridge: MindFlowEditorBridge
  ) {}

  public start(): Promise<void> {
    if (this.server || this.session) {
      return Promise.resolve();
    }
    if (!this.startPromise) {
      this.startPromise = this.startInternal().finally(() => {
        this.startPromise = undefined;
      });
    }
    return this.startPromise;
  }

  public dispose(): void {
    this.disposed = true;
    const server = this.server;
    this.server = undefined;
    this.session = undefined;
    this.protocols.clear();
    server?.close();
    if (this.sessionFilePath) {
      void fs.rm(this.sessionFilePath, { force: true });
    }
  }

  private async startInternal(): Promise<void> {
    let server: http.Server | undefined;
    try {
      if (this.disposed) {
        throw new Error("MindFlow MCP server manager has been disposed.");
      }
      const token = randomUUID();
      server = http.createServer((request, response) => {
        void this.handleHttpRequest(token, request, response);
      });
      const port = await listen(server);
      if (this.disposed) {
        server.close();
        return;
      }
      const sessionPath = this.sessionPath();
      const endpoint = `http://127.0.0.1:${port}/mcp`;
      const stdioBridgePath = path.join(this.context.extensionUri.fsPath, MINDFLOW_STDIO_PROXY_RELATIVE_PATH);
      const session: MindFlowMcpSession = {
        endpoint,
        port,
        token,
        pid: process.pid,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        workspaceRoots: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
        extensionVersion: String(this.context.extension.packageJSON?.version ?? "unknown"),
        sessionPath,
        stdioCommand: "node",
        stdioArgs: [stdioBridgePath]
      };
      await cleanupStaleSessions(path.dirname(sessionPath));
      await writeSessionFile(sessionPath, session);
      if (this.disposed) {
        server.close();
        await fs.rm(sessionPath, { force: true });
        return;
      }
      this.server = server;
      this.session = session;
      this.sessionFilePath = sessionPath;
      this.startError = undefined;
    } catch (error) {
      server?.close();
      this.startError = error instanceof Error ? error.message : String(error);
      console.warn(`MindFlow MCP server failed to start: ${this.startError}`);
    }
  }

  private async handleHttpRequest(
    token: string,
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    if (request.method !== "POST" || request.url !== "/mcp") {
      writeJson(response, 404, { error: "Not found" });
      return;
    }
    if (!isAuthorized(request, token)) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }
    try {
      const body = await readBody(request);
      void this.touchSessionRegistry();
      const protocol = this.protocolForRequest(request);
      const result = await protocol.handle(JSON.parse(body));
      if (result === undefined) {
        response.statusCode = 202;
        response.end();
        return;
      }
      writeJson(response, 200, result);
    } catch (error) {
      const tooLarge = error instanceof RequestBodyTooLargeError;
      writeJson(response, tooLarge ? 413 : 400, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: tooLarge ? -32600 : -32700,
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private sessionPath(): string {
    return path.join(mcpSessionDirectory(), `${this.sessionId}.json`);
  }

  private async touchSessionRegistry(): Promise<void> {
    if (!this.session || Date.now() - this.lastRegistryWrite < 5000) {
      return;
    }
    this.lastRegistryWrite = Date.now();
    this.session.lastSeenAt = new Date().toISOString();
    await writeSessionFile(this.session.sessionPath, this.session).catch(() => undefined);
  }

  private protocolForRequest(request: http.IncomingMessage): MindFlowMcpProtocol {
    const header = request.headers?.["x-mindflow-mcp-client"];
    const rawClientId = Array.isArray(header) ? header[0] : header;
    const clientId = typeof rawClientId === "string" && rawClientId.trim() ? rawClientId.trim().slice(0, 128) : "direct";
    const existing = this.protocols.get(clientId);
    if (existing) {
      return existing;
    }
    const protocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(this.bridge));
    this.protocols.set(clientId, protocol);
    return protocol;
  }
}

async function writeSessionFile(sessionPath: string, session: MindFlowMcpSession): Promise<void> {
  const directory = path.dirname(sessionPath);
  const temporaryPath = `${sessionPath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(session, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryPath, sessionPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function mcpSessionDirectory(): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "MindFlow", "mcp", "sessions");
  }
  return path.join(os.homedir(), ".mindflow", "mcp", "sessions");
}

async function cleanupStaleSessions(directory: string): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as { pid?: unknown };
      if (typeof parsed.pid !== "number" || !Number.isInteger(parsed.pid)) {
        await fs.rm(filePath, { force: true });
        return;
      }
      process.kill(parsed.pid, 0);
    } catch {
      await fs.rm(filePath, { force: true });
    }
  }));
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to determine MindFlow MCP server port."));
        return;
      }
      resolve(address.port);
    });
  });
}

function isAuthorized(request: http.IncomingMessage, token: string): boolean {
  const header = request.headers?.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${token}`;
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    request.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }
      totalBytes += chunk.length;
      if (totalBytes > MAX_MCP_REQUEST_BODY_BYTES) {
        settled = true;
        reject(new RequestBodyTooLargeError(MAX_MCP_REQUEST_BODY_BYTES));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } catch (error) {
        reject(error);
      }
    });
  });
}

class RequestBodyTooLargeError extends Error {
  public constructor(limitBytes: number) {
    super(`MindFlow MCP request body exceeds ${limitBytes} bytes.`);
  }
}

function writeJson(response: http.ServerResponse, statusCode: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", String(Buffer.byteLength(body)));
  response.end(body);
}
