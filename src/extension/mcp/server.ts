import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";
import * as vscode from "vscode";
import type { MindFlowEditorBridge } from "../../mcp/bridge";
import { MindFlowMcpProtocol } from "../../mcp/protocol";
import { MindFlowMcpToolHandlers } from "../../mcp/tools";

const MAX_MCP_REQUEST_BODY_BYTES = 10 * 1024 * 1024;

export interface MindFlowMcpSession {
  endpoint: string;
  port: number;
  token: string;
  sessionPath: string;
  stdioCommand: string;
  stdioArgs: string[];
}

export class MindFlowMcpServerManager implements vscode.Disposable {
  private server: http.Server | undefined;
  private session: MindFlowMcpSession | undefined;
  private startError: string | undefined;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly bridge: MindFlowEditorBridge
  ) {}

  public async start(): Promise<void> {
    if (this.server || this.session) {
      return;
    }
    try {
      const token = randomUUID();
      const protocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(this.bridge));
      const server = http.createServer((request, response) => {
        void this.handleHttpRequest(protocol, token, request, response);
      });
      const port = await listen(server);
      const sessionPath = this.sessionPath();
      const endpoint = `http://127.0.0.1:${port}/mcp`;
      const stdioBridgePath = path.join(this.context.extensionUri.fsPath, "out", "src", "mcp", "stdioBridge.js");
      const session: MindFlowMcpSession = {
        endpoint,
        port,
        token,
        sessionPath,
        stdioCommand: "node",
        stdioArgs: [stdioBridgePath]
      };
      await fs.mkdir(path.dirname(sessionPath), { recursive: true });
      await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
      this.server = server;
      this.session = session;
      this.startError = undefined;
    } catch (error) {
      this.startError = error instanceof Error ? error.message : String(error);
      console.warn(`MindFlow MCP server failed to start: ${this.startError}`);
    }
  }

  public async copyClientConfig(): Promise<void> {
    await this.start();
    if (!this.session) {
      throw new Error(this.startError ? `MindFlow MCP server is unavailable: ${this.startError}` : "MindFlow MCP server is unavailable.");
    }
    const config = {
      mcpServers: {
        mindflow: {
          command: this.session.stdioCommand,
          args: this.session.stdioArgs,
          env: {
            MINDFLOW_MCP_SESSION: this.session.sessionPath
          }
        }
      }
    };
    await vscode.env.clipboard.writeText(JSON.stringify(config, null, 2));
  }

  public dispose(): void {
    const server = this.server;
    this.server = undefined;
    this.session = undefined;
    server?.close();
  }

  private async handleHttpRequest(
    protocol: MindFlowMcpProtocol,
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
    return path.join(this.context.globalStorageUri.fsPath, "mcp-session.json");
  }
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
