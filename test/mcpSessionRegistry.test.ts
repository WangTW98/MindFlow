import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { mindflowToolsetHash } from "../src/platform/mcp/protocol/toolsetHash";
import { discoverMindFlowSessions } from "../src/platform/mcp/runtime/sessionRegistry";

test("session discovery accepts only current safe local records", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-session-registry-"));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-session-workspace-"));
  const now = new Date().toISOString();
  const valid = sessionRecord("valid", workspace, now);
  try {
    await fs.writeFile(path.join(directory, "valid.json"), JSON.stringify(valid), { mode: 0o600 });
    await fs.writeFile(path.join(directory, "legacy.json"), JSON.stringify({
      endpoint: valid.endpoint, token: "legacy", pid: process.pid, workspaceRoots: [workspace]
    }), { mode: 0o600 });
    await fs.writeFile(path.join(directory, "unsafe.json"), JSON.stringify({
      ...sessionRecord("unsafe", workspace, now), endpoint: "http://example.com/mcp"
    }), { mode: 0o600 });
    await fs.writeFile(path.join(directory, "mismatch.json"), JSON.stringify({
      ...sessionRecord("mismatch", workspace, now), toolsetHash: "0".repeat(64)
    }), { mode: 0o600 });
    await fs.symlink(path.join(directory, "valid.json"), path.join(directory, "linked.json"));

    const discovery = await discoverMindFlowSessions(directory, mindflowToolsetHash());
    assert.deepEqual(discovery.sessions.map((session) => session.sessionId), ["valid"]);
    assert.equal(discovery.unavailable.length, 4);
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("toolset")));
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("Unsafe")));
    assert.ok(discovery.unavailable.some((item) => item.reason.includes("regular file")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

function sessionRecord(sessionId: string, workspace: string, now: string): Record<string, unknown> {
  return {
    sessionId,
    endpoint: "http://127.0.0.1:43123/mcp",
    token: "secret",
    pid: process.pid,
    createdAt: now,
    lastSeenAt: now,
    extensionVersion: "0.1.0",
    toolsetHash: mindflowToolsetHash(),
    workspaceFolders: [{ uri: pathToFileURL(workspace).toString(), fsPath: workspace, name: path.basename(workspace) }],
    windowFocused: false,
    lastFocusedAt: now
  };
}
