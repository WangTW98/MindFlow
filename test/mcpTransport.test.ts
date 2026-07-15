import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../src/platform/mcp/protocol/bridge";
import { MindFlowMcpProtocol } from "../src/platform/mcp/protocol/jsonRpcProtocol";
import { MindFlowMcpToolHandlers } from "../src/platform/mcp/tools";
import { emptyFlowSelection, type FlowSelectionPatch } from "../src/product-flow/domain/selection";

test("MCP protocol validates JSON-RPC and initialization lifecycle", async () => {
  const flow = createEmptyProductFlow();
  const protocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(new TestBridge(flow)));

  const invalid = await protocol.handle({ jsonrpc: "1.0", id: 1, method: "ping" });
  assert.equal(readErrorCode(invalid), -32600);

  const beforeInitialize = await protocol.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(readErrorCode(beforeInitialize), -32002);

  const initialized = await protocol.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } }
  });
  assert.equal((initialized?.result as Record<string, unknown>).protocolVersion, "2024-11-05");
  assert.equal(await protocol.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);

  const tools = await protocol.handle({ jsonrpc: "2.0", id: 4, method: "tools/list" });
  assert.ok(Array.isArray((tools?.result as Record<string, unknown>).tools));

  const missing = await protocol.handle({ jsonrpc: "2.0", id: 5, method: "missing/method" });
  assert.equal(readErrorCode(missing), -32601);
});

test("MCP stdio proxy uses newline-delimited UTF-8 and emits no notification response", async () => {
  const token = "transport-test-token";
  const received: Array<Record<string, unknown>> = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      received.push(payload);
      if (!("id" in payload)) {
        response.statusCode = 202;
        response.end();
        return;
      }
      const body = JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: { echoed: payload.params } });
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(body);
    });
  });
  const port = await listen(server);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-mcp-proxy-"));
  const sessionPath = path.join(directory, "session.json");
  await fs.writeFile(sessionPath, JSON.stringify({
    endpoint: `http://127.0.0.1:${port}/mcp`,
    token,
    pid: process.pid,
    createdAt: new Date().toISOString()
  }), "utf8");

  try {
    const child = spawn(process.execPath, [path.join(process.cwd(), "out-test/src/platform/mcp/protocol/stdioProxy.js")], {
      cwd: process.cwd(),
      env: { ...process.env, MINDFLOW_MCP_SESSION: sessionPath },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "echo", params: { text: "中文🙂" } })}\r\n`);
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "echo", params: { value: 2 } })}\n`);
    child.stdin?.end();
    const exitCode = await waitForClose(child);

    assert.equal(exitCode, 0, stderr);
    const lines = stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(lines.length, 2, `Unexpected stdout: ${stdout}`);
    const first = lines[0]!;
    const second = lines[1]!;
    assert.equal(first.id, 1);
    assert.ok(first.result, `Unexpected proxy response: ${stdout}; stderr: ${stderr}`);
    assert.equal((((first.result as Record<string, unknown>).echoed as Record<string, unknown>).text), "中文🙂");
    assert.equal(second.id, 2);
    assert.equal(received.length, 3);
    assert.equal(stderr, "");
  } finally {
    await close(server);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function readErrorCode(response: Record<string, unknown> | undefined): unknown {
  return (response?.error as Record<string, unknown> | undefined)?.code;
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Missing test server address."));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function waitForClose(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
}

class TestBridge implements MindFlowEditorBridge {
  public constructor(private readonly flow: ReturnType<typeof createEmptyProductFlow>) {}

  public async getOpenEditors(): Promise<MindFlowEditorSnapshot[]> {
    return [this.snapshot()];
  }

  public async getActiveEditor(): Promise<MindFlowEditorSnapshot> {
    return this.snapshot();
  }

  public async setSelection(_flowUri: string, _patch: FlowSelectionPatch): Promise<MindFlowEditorSnapshot> {
    return this.snapshot();
  }

  public async applyFlowEdit(): Promise<MindFlowEditorSnapshot> {
    return this.snapshot();
  }

  private snapshot(): MindFlowEditorSnapshot {
    return {
      uri: "file:///workspace/test.mindflow",
      path: "/workspace/test.mindflow",
      displayName: "test.mindflow",
      active: true,
      dirty: false,
      flow: this.flow,
      selection: emptyFlowSelection()
    };
  }
}
