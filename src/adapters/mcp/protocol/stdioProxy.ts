import * as fs from "node:fs";
import * as http from "node:http";

interface SessionFile {
  endpoint: string;
  token: string;
}

let inputBuffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  void drainInput();
});
process.stdin.on("end", () => {
  void drainInput();
});

async function drainInput(): Promise<void> {
  while (true) {
    const separatorIndex = inputBuffer.indexOf("\r\n\r\n");
    if (separatorIndex < 0) {
      return;
    }
    const header = inputBuffer.slice(0, separatorIndex);
    const lengthMatch = /content-length:\s*(\d+)/i.exec(header);
    if (!lengthMatch) {
      inputBuffer = "";
      writeStderr("Invalid MCP stdio frame: missing Content-Length.\n");
      return;
    }
    const bodyStart = separatorIndex + 4;
    const bodyLength = Number(lengthMatch[1]);
    if (inputBuffer.length < bodyStart + bodyLength) {
      return;
    }
    const body = inputBuffer.slice(bodyStart, bodyStart + bodyLength);
    inputBuffer = inputBuffer.slice(bodyStart + bodyLength);
    await forwardFrame(body);
  }
}

async function forwardFrame(body: string): Promise<void> {
  try {
    const session = readSession();
    const response = await postJson(session, body);
    writeFrame(response);
  } catch (error) {
    const fallbackId = readRequestId(body);
    writeFrame(JSON.stringify({
      jsonrpc: "2.0",
      id: fallbackId,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error)
      }
    }));
  }
}

function readSession(): SessionFile {
  const sessionPath = process.env.MINDFLOW_MCP_SESSION || process.argv[2];
  if (!sessionPath) {
    throw new Error("MINDFLOW_MCP_SESSION is not set. Run MindFlow: Copy MCP Client Config from VS Code.");
  }
  const parsed = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as Partial<SessionFile>;
  if (!parsed.endpoint || !parsed.token) {
    throw new Error(`Invalid MindFlow MCP session file: ${sessionPath}`);
  }
  return { endpoint: parsed.endpoint, token: parsed.token };
}

function postJson(session: SessionFile, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(session.endpoint), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.token}`,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body))
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(text || `MindFlow MCP HTTP ${response.statusCode}`));
          return;
        }
        resolve(text || "null");
      });
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function writeFrame(body: string): void {
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function writeStderr(message: string): void {
  process.stderr.write(message);
}

function readRequestId(body: string): string | number | null {
  try {
    const parsed = JSON.parse(body) as { id?: string | number | null };
    return parsed.id ?? null;
  } catch {
    return null;
  }
}
