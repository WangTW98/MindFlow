import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";

const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

interface SessionFile {
  endpoint: string;
  token: string;
  pid: number;
  createdAt: string;
}

const clientId = randomUUID();
let inputBuffer = "";
let processing = Promise.resolve();

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  scheduleDrain(false);
});
process.stdin.on("end", () => {
  scheduleDrain(true);
});

function scheduleDrain(flushRemainder: boolean): void {
  processing = processing
    .then(() => drainInput(flushRemainder))
    .catch((error) => writeStderr(`MindFlow MCP proxy failed: ${errorMessage(error)}\n`));
}

async function drainInput(flushRemainder: boolean): Promise<void> {
  while (true) {
    const newlineIndex = inputBuffer.indexOf("\n");
    if (newlineIndex < 0) {
      break;
    }
    const line = inputBuffer.slice(0, newlineIndex).replace(/\r$/, "");
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    if (line.trim()) {
      await forwardMessage(line);
    }
  }

  if (Buffer.byteLength(inputBuffer) > MAX_MESSAGE_BYTES) {
    inputBuffer = "";
    throw new Error(`MCP stdio message exceeds ${MAX_MESSAGE_BYTES} bytes.`);
  }

  if (flushRemainder && inputBuffer.trim()) {
    const finalLine = inputBuffer.replace(/\r$/, "");
    inputBuffer = "";
    await forwardMessage(finalLine);
  }
}

async function forwardMessage(body: string): Promise<void> {
  if (Buffer.byteLength(body) > MAX_MESSAGE_BYTES) {
    writeProxyError(body, `MCP stdio message exceeds ${MAX_MESSAGE_BYTES} bytes.`);
    return;
  }

  try {
    const session = readSession();
    const response = await postJson(session, body);
    if (response) {
      writeMessage(response);
    }
  } catch (error) {
    writeProxyError(body, errorMessage(error));
  }
}

function readSession(): SessionFile {
  const sessionPath = process.env.MINDFLOW_MCP_SESSION || process.argv[2];
  if (!sessionPath) {
    throw new Error("MINDFLOW_MCP_SESSION is not set. Run MindFlow: Copy MCP Client Config from VS Code.");
  }
  const parsed = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as Partial<SessionFile>;
  const pid = parsed.pid;
  if (!parsed.endpoint || !parsed.token || typeof pid !== "number" || !Number.isInteger(pid) || typeof parsed.createdAt !== "string") {
    throw new Error(`Invalid MindFlow MCP session file: ${sessionPath}`);
  }
  const endpoint = new URL(parsed.endpoint);
  if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.pathname !== "/mcp") {
    throw new Error(`Unsafe MindFlow MCP endpoint in session file: ${parsed.endpoint}`);
  }
  try {
    process.kill(pid, 0);
  } catch {
    throw new Error("MindFlow MCP extension process is no longer running. Copy a new MCP client config from VS Code.");
  }
  return {
    endpoint: endpoint.toString(),
    token: parsed.token,
    pid,
    createdAt: parsed.createdAt
  };
}

function postJson(session: SessionFile, body: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };
    const request = http.request(new URL(session.endpoint), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.token}`,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
        "X-MindFlow-Mcp-Client": clientId
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_MESSAGE_BYTES) {
          request.destroy(new Error(`MindFlow MCP response exceeds ${MAX_MESSAGE_BYTES} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => finish(() => {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(text || `MindFlow MCP HTTP ${response.statusCode}`));
          return;
        }
        resolve(text || undefined);
      }));
    });
    request.on("error", (error) => finish(() => reject(error)));
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error(`MindFlow MCP request timed out after ${REQUEST_TIMEOUT_MS}ms.`));
    });
    request.write(body);
    request.end();
  });
}

function writeProxyError(body: string, message: string): void {
  const request = readRequestMetadata(body);
  if (request.isNotification) {
    writeStderr(`MindFlow MCP notification failed: ${message}\n`);
    return;
  }
  writeMessage(JSON.stringify({
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32603, message }
  }));
}

function writeMessage(body: string): void {
  process.stdout.write(`${body}\n`);
}

function writeStderr(message: string): void {
  process.stderr.write(message);
}

function readRequestMetadata(body: string): { id: string | number | null; isNotification: boolean } {
  try {
    const parsed = JSON.parse(body) as { id?: unknown };
    if (!("id" in parsed)) {
      return { id: null, isNotification: true };
    }
    return {
      id: typeof parsed.id === "string" || (typeof parsed.id === "number" && Number.isInteger(parsed.id)) ? parsed.id : null,
      isNotification: false
    };
  } catch {
    return { id: null, isNotification: false };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
