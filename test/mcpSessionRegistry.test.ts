import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { mindflowMcpContractHash } from "../src/platform/mcp/protocol/contractHash";
import { discoverMindFlowSessions } from "../src/platform/mcp/runtime/sessionRegistry";

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
    contractHash: mindflowMcpContractHash(),
    windowFocused: false,
    lastFocusedAt: now
  };
}
