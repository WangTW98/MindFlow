import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { mindflowMcpCompatibilityDescriptor, mindflowMcpContractHash } from "../src/platform/mcp/protocol/contractHash";
import { MINDFLOW_MCP_CONTRACT_VERSION } from "../src/platform/mcp/protocol/globalToolSchemas";
import { discoverMindFlowSessions, MINDFLOW_SESSION_STALE_AFTER_MS } from "../src/platform/mcp/runtime/sessionRegistry";

test("host discovery accepts empty-window hosts and rejects legacy workspace records", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-session-registry-"));
  const now = new Date().toISOString();
  const valid = hostRecord("valid", now);
  try {
    await fs.writeFile(path.join(directory, "valid.json"), JSON.stringify(valid), { mode: 0o600 });
    await fs.writeFile(path.join(directory, "legacy.json"), JSON.stringify({
      sessionId: "legacy", endpoint: valid.endpoint, token: "legacy", pid: process.pid,
      workspaceFolders: [], toolsetHash: "0".repeat(64)
    }), { mode: 0o600 });
    await fs.writeFile(path.join(directory, "unsafe.json"), JSON.stringify({
      ...hostRecord("unsafe", now), endpoint: "http://example.com/mcp"
    }), { mode: 0o600 });
    await fs.writeFile(path.join(directory, "mismatch.json"), JSON.stringify({
      ...hostRecord("mismatch", now), contractHash: "0".repeat(64)
    }), { mode: 0o600 });
    await fs.symlink(path.join(directory, "valid.json"), path.join(directory, "linked.json"));

    const discovery = await discoverMindFlowSessions(directory, mindflowMcpContractHash());
    assert.deepEqual(discovery.sessions.map((host) => host.hostId), ["valid"]);
    assert.equal(discovery.sessions[0]?.displayName, "VS Code Window");
    assert.equal("workspaceFolders" in (discovery.sessions[0] ?? {}), false);
    assert.equal(discovery.unavailable.length, 4);
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("contract")));
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("Unsafe")));
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("regular file")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("MCP compatibility descriptor contains only versioned wire fields", () => {
  const descriptor = mindflowMcpCompatibilityDescriptor();
  const text = JSON.stringify(descriptor);
  assert.equal(text.includes("description"), false);
  assert.equal(text.includes("annotations"), false);
  assert.equal(descriptor.contractVersion, MINDFLOW_MCP_CONTRACT_VERSION);
});

test("host discovery rejects stale and implausibly future heartbeats even when the pid is alive", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-session-heartbeat-"));
  const nowMs = Date.now();
  try {
    await fs.writeFile(path.join(directory, "stale.json"), JSON.stringify(hostRecord(
      "stale",
      new Date(nowMs - MINDFLOW_SESSION_STALE_AFTER_MS - 1).toISOString()
    )), { mode: 0o600 });
    await fs.writeFile(path.join(directory, "future.json"), JSON.stringify(hostRecord(
      "future",
      new Date(nowMs + 10 * 60_000).toISOString()
    )), { mode: 0o600 });

    const discovery = await discoverMindFlowSessions(directory, mindflowMcpContractHash(), nowMs);
    assert.deepEqual(discovery.sessions, []);
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("stale")));
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("future")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function hostRecord(hostId: string, now: string): Record<string, unknown> {
  return {
    hostId,
    displayName: "VS Code Window",
    environment: "local",
    endpoint: "http://127.0.0.1:43123/mcp",
    token: "secret",
    pid: process.pid,
    createdAt: now,
    lastSeenAt: now,
    extensionVersion: "0.1.0",
    contractVersion: MINDFLOW_MCP_CONTRACT_VERSION,
    contractHash: mindflowMcpContractHash(),
    windowFocused: false,
    lastFocusedAt: now
  };
}
