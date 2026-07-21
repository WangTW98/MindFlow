import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../src/platform/mcp/protocol/bridge";
import { mindflowMcpContractHash } from "../src/platform/mcp/protocol/contractHash";
import { MINDFLOW_MCP_CONTRACT_VERSION } from "../src/platform/mcp/protocol/globalToolSchemas";
import { MindFlowMcpProtocol } from "../src/platform/mcp/protocol/jsonRpcProtocol";
import { MINDFLOW_LATEST_MCP_PROTOCOL_VERSION } from "../src/platform/mcp/protocol/protocolVersion";
import { isMcpStdioMessageWithinLimit, MAX_MCP_MESSAGE_BYTES, MindFlowGlobalRouter } from "../src/platform/mcp/runtime/globalRouter";
import { MindFlowMcpToolHandlers } from "../src/platform/mcp/tools";
import { emptyFlowSelection, type FlowSelectionPatch } from "../src/product-flow/domain/selection";
import { MINDFLOW_VERSION } from "../src/shared/version";

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
    params: { protocolVersion: MINDFLOW_LATEST_MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "1" } }
  });
  assert.equal((initialized?.result as Record<string, unknown>).protocolVersion, MINDFLOW_LATEST_MCP_PROTOCOL_VERSION);
  assert.equal(await protocol.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);

  const tools = await protocol.handle({ jsonrpc: "2.0", id: 4, method: "tools/list" });
  assert.ok(Array.isArray((tools?.result as Record<string, unknown>).tools));

  const missing = await protocol.handle({ jsonrpc: "2.0", id: 5, method: "missing/method" });
  assert.equal(readErrorCode(missing), -32601);
});

test("MCP protocol preserves the compatible legacy version and falls back to latest", async () => {
  for (const [requested, expected] of [
    ["2024-11-05", "2024-11-05"],
    ["2099-01-01", MINDFLOW_LATEST_MCP_PROTOCOL_VERSION]
  ]) {
    const protocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(new TestBridge(createEmptyProductFlow())));
    const initialized = await protocol.handle({
      jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: requested }
    });
    assert.equal((initialized?.result as Record<string, unknown>).protocolVersion, expected);
  }
});

test("global MCP Router negotiates current, legacy, and unsupported protocol versions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-router-negotiation-"));
  try {
    for (const [requested, expected] of [
      [MINDFLOW_LATEST_MCP_PROTOCOL_VERSION, MINDFLOW_LATEST_MCP_PROTOCOL_VERSION],
      ["2024-11-05", "2024-11-05"],
      ["2099-01-01", MINDFLOW_LATEST_MCP_PROTOCOL_VERSION]
    ]) {
      const router = new MindFlowGlobalRouter(directory);
      const initialized = await router.handle({
        jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: requested }
      });
      assert.equal((initialized?.result as Record<string, unknown>).protocolVersion, expected);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("global MCP Router enforces its stdio limit on each complete message", () => {
  assert.equal(isMcpStdioMessageWithinLimit("x".repeat(MAX_MCP_MESSAGE_BYTES)), true);
  assert.equal(isMcpStdioMessageWithinLimit("x".repeat(MAX_MCP_MESSAGE_BYTES + 1)), false);
  assert.equal(isMcpStdioMessageWithinLimit("你".repeat(Math.floor(MAX_MCP_MESSAGE_BYTES / 3) + 1)), false);
});

test("global MCP Router discovers a live host and aggregates its editors", async () => {
  const token = "transport-test-token";
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-router-workspace-"));
  const flowPath = path.join(workspace, "test.mindflow");
  const flow = createEmptyProductFlow("Router Test");
  const bridge = new TestBridge(flow, flowPath);
  const backendProtocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(bridge));
  const backendClientVersions: unknown[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", async () => {
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      if (payload.method === "initialize") {
        const params = payload.params as Record<string, unknown>;
        backendClientVersions.push((params.clientInfo as Record<string, unknown>).version);
      }
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
  await fs.writeFile(path.join(directory, "host-a.json"), JSON.stringify({
    hostId: "host-a", displayName: "VS Code Window", environment: "local",
    endpoint: `http://127.0.0.1:${port}/mcp`, token, pid: process.pid,
    createdAt: now, lastSeenAt: now, extensionVersion: "0.1.0", contractVersion: MINDFLOW_MCP_CONTRACT_VERSION, contractHash: mindflowMcpContractHash(),
    windowFocused: true, lastFocusedAt: now
  }), { encoding: "utf8", mode: 0o600 });

  try {
    const router = new MindFlowGlobalRouter(directory);
    const initialized = await router.handle({
      jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" }
    });
    assert.equal((initialized?.result as Record<string, unknown>).protocolVersion, "2024-11-05");
    await router.handle({ jsonrpc: "2.0", method: "notifications/initialized" });

    const hosts = await router.handle({
      jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "mindflow_list_hosts", arguments: {} }
    });
    const hostResult = readStructuredToolResult(hosts);
    assert.equal((hostResult.hosts as unknown[]).length, 1);

    const editors = await router.handle({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mindflow_get_open_editors", arguments: {} }
    });
    const editorResult = readStructuredToolResult(editors);
    const editor = (editorResult.editors as Array<Record<string, unknown>>)[0]!;
    assert.equal(editor.path, flowPath);
    assert.equal(editor.hostId, "host-a");
    assert.equal(editor.hostName, "VS Code Window");
    assert.equal("workspaceName" in editor, false);
    assert.deepEqual(backendClientVersions, [MINDFLOW_VERSION]);

    const externalPath = path.join(os.tmpdir(), "mindflow-external", "external.mindflow");
    const opened = await router.handle({
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "mindflow_open_flow", arguments: { flowPath: externalPath } }
    });
    console.error("DEBUG FULL OPENED:", JSON.stringify(opened));
    assert.equal((readStructuredToolResult(opened).editor as Record<string, unknown>).path, externalPath);
    assert.deepEqual(bridge.openedPaths, [externalPath]);

    const relative = await router.handle({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "mindflow_open_flow", arguments: { flowPath: "relative.mindflow" } }
    });
    assert.match(readErrorMessage(relative), /absolute local path/);

    const wrongExtension = await router.handle({
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name: "mindflow_open_flow", arguments: { flowPath: path.join(os.tmpdir(), "wrong.json") } }
    });
    assert.match(readErrorMessage(wrongExtension), /\.mindflow/);
  } finally {
    await close(server);
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("global MCP Router exposes hostId on every backend tool and works without a host", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-empty-router-"));
  try {
    const router = new MindFlowGlobalRouter(directory);
    await initializeRouter(router);
    const listed = await router.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = ((listed?.result as Record<string, unknown>).tools as Array<Record<string, unknown>>);
    const backendTools = tools.filter((tool) => tool.name !== "mindflow_list_hosts");
    assert.ok(backendTools.length > 0);
    for (const tool of backendTools) {
      const schema = tool.inputSchema as Record<string, unknown>;
      const properties = schema.properties as Record<string, unknown>;
      assert.ok("hostId" in properties, `${String(tool.name)} must expose hostId`);
    }
    assert.equal(tools.some((tool) => tool.name === "mindflow_list_workspaces"), false);

    const hosts = await router.handle({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mindflow_list_hosts", arguments: {} }
    });
    assert.deepEqual(readStructuredToolResult(hosts).hosts, []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("global MCP Router uses recent focus, accepts hostId override, and routes by flowUri", async () => {
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
      const now = new Date(Date.now() + index * 1000).toISOString();
      const hostId = `host-${index}`;
      await fs.writeFile(path.join(directory, `${hostId}.json`), JSON.stringify({
        hostId, displayName: `host-window-${index}`, environment: "local",
        endpoint: `http://127.0.0.1:${port}/mcp`, token, pid: process.pid,
        createdAt: now, lastSeenAt: now, extensionVersion: "0.1.0", contractVersion: MINDFLOW_MCP_CONTRACT_VERSION, contractHash: mindflowMcpContractHash(),
        windowFocused: index === 0, lastFocusedAt: now
      }), { mode: 0o600 });
    }

    const router = new MindFlowGlobalRouter(directory);
    await initializeRouter(router);
    const automatic = await router.handle({
      jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "mindflow_get_editor_state", arguments: {} }
    });
    assert.equal(((readStructuredToolResult(automatic).editor as Record<string, unknown>).title), "Flow 0");

    const ambiguousWrite = await router.handle({
      jsonrpc: "2.0", id: 15, method: "tools/call",
      params: { name: "mindflow_update_root", arguments: { title: "Unsafe implicit write" } }
    });
    assert.match(readErrorMessage(ambiguousWrite), /explicit hostId or flowUri/);

    const ambiguousOpen = await router.handle({
      jsonrpc: "2.0", id: 16, method: "tools/call",
      params: { name: "mindflow_open_flow", arguments: { flowPath: path.join(os.tmpdir(), "ambiguous.mindflow") } }
    });
    assert.match(readErrorMessage(ambiguousOpen), /explicit hostId or flowUri/);

    const explicit = await router.handle({
      jsonrpc: "2.0", id: 14, method: "tools/call",
      params: { name: "mindflow_get_editor_state", arguments: { hostId: "host-1" } }
    });
    assert.equal(((readStructuredToolResult(explicit).editor as Record<string, unknown>).title), "Flow 1");

    const editorsResponse = await router.handle({
      jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "mindflow_get_open_editors", arguments: {} }
    });
    const editors = readStructuredToolResult(editorsResponse).editors as Array<Record<string, unknown>>;
    assert.equal(editors.length, 2);
    const target = editors.find((editor) => editor.hostId === "host-1")!;
    const routed = await router.handle({
      jsonrpc: "2.0", id: 12, method: "tools/call",
      params: { name: "mindflow_get_editor_state", arguments: { flowUri: target.uri } }
    });
    assert.equal(((readStructuredToolResult(routed).editor as Record<string, unknown>).title), "Flow 1");

    const mismatched = await router.handle({
      jsonrpc: "2.0", id: 13, method: "tools/call",
      params: { name: "mindflow_get_editor_state", arguments: { flowUri: target.uri, hostId: "host-0" } }
    });
    assert.match(readErrorMessage(mismatched), /does not own/);
  } finally {
    await Promise.all(backends.map(close));
    await Promise.all([directory, workspaceA, workspaceB].map((value) => fs.rm(value, { recursive: true, force: true })));
  }
});

test("global MCP Router rejects modifying a flow opened by multiple hosts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-duplicate-router-"));
  const sharedDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-shared-"));
  const sharedFlowPath = path.join(sharedDirectory, "shared.mindflow");
  const sharedAliasPath = path.join(sharedDirectory, "shared-alias.mindflow");
  const backends: http.Server[] = [];
  try {
    await fs.writeFile(sharedFlowPath, "{}", "utf8");
    await fs.symlink(sharedFlowPath, sharedAliasPath);
    for (let index = 0; index < 2; index += 1) {
      const token = `duplicate-token-${index}`;
      const protocol = new MindFlowMcpProtocol(new MindFlowMcpToolHandlers(
        new TestBridge(createEmptyProductFlow(`Duplicate ${index}`), index === 0 ? sharedFlowPath : sharedAliasPath)
      ));
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
      const now = new Date(Date.now() + index).toISOString();
      await fs.writeFile(path.join(directory, `duplicate-${index}.json`), JSON.stringify({
        hostId: `duplicate-${index}`, displayName: `duplicate-${index}`, environment: "local",
        endpoint: `http://127.0.0.1:${port}/mcp`, token, pid: process.pid,
        createdAt: now, lastSeenAt: now, extensionVersion: "0.1.0", contractVersion: MINDFLOW_MCP_CONTRACT_VERSION, contractHash: mindflowMcpContractHash(),
        windowFocused: index === 0, lastFocusedAt: now
      }), { mode: 0o600 });
    }

    const router = new MindFlowGlobalRouter(directory);
    await initializeRouter(router);
    const flowUri = pathToFileURL(sharedFlowPath).toString();
    const explicitRead = await router.handle({
      jsonrpc: "2.0", id: 20, method: "tools/call",
      params: { name: "mindflow_get_editor_state", arguments: { flowUri, hostId: "duplicate-1" } }
    });
    assert.equal(((readStructuredToolResult(explicitRead).editor as Record<string, unknown>).title), "Duplicate 1");

    const duplicateWrite = await router.handle({
      jsonrpc: "2.0", id: 21, method: "tools/call",
      params: { name: "mindflow_update_root", arguments: { flowUri, hostId: "duplicate-1", title: "Unsafe write" } }
    });
    assert.match(readErrorMessage(duplicateWrite), /open in multiple MindFlow hosts/);
  } finally {
    await Promise.all(backends.map(close));
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(sharedDirectory, { recursive: true, force: true });
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
  await router.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MINDFLOW_LATEST_MCP_PROTOCOL_VERSION } });
  await router.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
}

class TestBridge implements MindFlowEditorBridge {
  public readonly openedPaths: string[] = [];

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

  public async openFlow(flowPath: string): Promise<MindFlowEditorSnapshot> {
    this.openedPaths.push(flowPath);
    return this.snapshot(flowPath);
  }

  public async setSelection(_flowUri: string, _patch: FlowSelectionPatch): Promise<MindFlowEditorSnapshot> {
    return this.snapshot();
  }

  public async applyFlowEdit(): Promise<MindFlowEditorSnapshot> {
    return this.snapshot();
  }

  private snapshot(flowPath = this.flowPath): MindFlowEditorSnapshot {
    return {
      uri: new URL(`file://${flowPath}`).toString(),
      path: flowPath,
      displayName: "test.mindflow",
      active: true,
      dirty: false,
      flow: this.flow,
      selection: emptyFlowSelection()
    };
  }
}
