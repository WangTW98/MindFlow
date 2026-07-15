import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../src/platform/mcp/protocol/bridge";
import { MindFlowMcpProtocol } from "../src/platform/mcp/protocol/jsonRpcProtocol";
import { mindflowToolsetHash } from "../src/platform/mcp/protocol/toolsetHash";
import { MindFlowGlobalRouter } from "../src/platform/mcp/runtime/globalRouter";
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

test("global MCP Router discovers a live workspace and aggregates its editors", async () => {
  const token = "transport-test-token";
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-router-workspace-"));
  const flowPath = path.join(workspace, "test.mindflow");
  const flow = createEmptyProductFlow("Router Test");
  const backendProtocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(new TestBridge(flow, flowPath)));
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", async () => {
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      const result = await backendProtocol.handle(payload);
      if (result === undefined) {
        response.statusCode = 202;
        response.end();
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
    });
  });
  const port = await listen(server);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-mcp-router-"));
  const now = new Date().toISOString();
  await fs.writeFile(path.join(directory, "session-a.json"), JSON.stringify({
    sessionId: "session-a",
    endpoint: `http://127.0.0.1:${port}/mcp`, token, pid: process.pid,
    createdAt: now, lastSeenAt: now, extensionVersion: "0.1.0", toolsetHash: mindflowToolsetHash(),
    workspaceFolders: [{ uri: new URL(`file://${workspace}`).toString(), fsPath: workspace, name: "router-workspace" }],
    windowFocused: true, lastFocusedAt: now
  }), { encoding: "utf8", mode: 0o600 });

  try {
    const router = new MindFlowGlobalRouter(directory);
    const initialized = await router.handle({
      jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" }
    });
    assert.equal((initialized?.result as Record<string, unknown>).protocolVersion, "2024-11-05");
    await router.handle({ jsonrpc: "2.0", method: "notifications/initialized" });

    const workspaces = await router.handle({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "mindflow_list_workspaces", arguments: {} }
    });
    const workspaceResult = readStructuredToolResult(workspaces);
    assert.equal((workspaceResult.workspaces as unknown[]).length, 1);

    const editors = await router.handle({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mindflow_get_open_editors", arguments: {} }
    });
    const editorResult = readStructuredToolResult(editors);
    const editor = (editorResult.editors as Array<Record<string, unknown>>)[0]!;
    assert.equal(editor.path, flowPath);
    assert.equal(editor.workspaceName, "router-workspace");
  } finally {
    await close(server);
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("global MCP Router requires explicit targets across workspaces and routes by flowUri", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-mcp-multi-router-"));
  const workspaceA = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-router-a-"));
  const workspaceB = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-router-b-"));
  const backends: http.Server[] = [];
  try {
    for (const [index, workspace] of [workspaceA, workspaceB].entries()) {
      const token = `token-${index}`;
      const flowPath = path.join(workspace, `flow-${index}.mindflow`);
      const protocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(new TestBridge(createEmptyProductFlow(`Flow ${index}`), flowPath)));
      const server = http.createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        request.on("end", async () => {
          assert.equal(request.headers.authorization, `Bearer ${token}`);
          const result = await protocol.handle(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          if (result === undefined) {
            response.statusCode = 202;
            response.end();
          } else {
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify(result));
          }
        });
      });
      backends.push(server);
      const port = await listen(server);
      const now = new Date().toISOString();
      const sessionId = `session-${index}`;
      await fs.writeFile(path.join(directory, `${sessionId}.json`), JSON.stringify({
        sessionId,
        endpoint: `http://127.0.0.1:${port}/mcp`, token, pid: process.pid,
        createdAt: now, lastSeenAt: now, extensionVersion: "0.1.0", toolsetHash: mindflowToolsetHash(),
        workspaceFolders: [{ uri: new URL(`file://${workspace}`).toString(), fsPath: workspace, name: `workspace-${index}` }],
        windowFocused: index === 0, lastFocusedAt: now
      }), { mode: 0o600 });
    }

    const router = new MindFlowGlobalRouter(directory);
    await initializeRouter(router);
    const ambiguous = await router.handle({
      jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "mindflow_get_editor_state", arguments: {} }
    });
    assert.match(readErrorMessage(ambiguous), /Multiple MindFlow sessions or workspaces/);

    const editorsResponse = await router.handle({
      jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "mindflow_get_open_editors", arguments: {} }
    });
    const editors = readStructuredToolResult(editorsResponse).editors as Array<Record<string, unknown>>;
    assert.equal(editors.length, 2);
    const target = editors.find((editor) => editor.workspaceName === "workspace-1")!;
    const routed = await router.handle({
      jsonrpc: "2.0", id: 12, method: "tools/call",
      params: { name: "mindflow_get_editor_state", arguments: { flowUri: target.uri } }
    });
    assert.equal(((readStructuredToolResult(routed).editor as Record<string, unknown>).title), "Flow 1");

    const ambiguousCreate = await router.handle({
      jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "mindflow_create_flow", arguments: { title: "New" } }
    });
    assert.match(readErrorMessage(ambiguousCreate), /Specify workspaceUri/);
  } finally {
    await Promise.all(backends.map(close));
    await Promise.all([directory, workspaceA, workspaceB].map((value) => fs.rm(value, { recursive: true, force: true })));
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

function readStructuredToolResult(response: Record<string, unknown> | undefined): Record<string, unknown> {
  const result = response?.result as Record<string, unknown> | undefined;
  return result?.structuredContent as Record<string, unknown>;
}

function readErrorMessage(response: Record<string, unknown> | undefined): string {
  return String((response?.error as Record<string, unknown> | undefined)?.message ?? "");
}

async function initializeRouter(router: MindFlowGlobalRouter): Promise<void> {
  await router.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
  await router.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
}

class TestBridge implements MindFlowEditorBridge {
  public constructor(
    private readonly flow: ReturnType<typeof createEmptyProductFlow>,
    private readonly flowPath = "/workspace/test.mindflow"
  ) {}

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
      uri: new URL(`file://${this.flowPath}`).toString(),
      path: this.flowPath,
      displayName: "test.mindflow",
      active: true,
      dirty: false,
      flow: this.flow,
      selection: emptyFlowSelection()
    };
  }
}
