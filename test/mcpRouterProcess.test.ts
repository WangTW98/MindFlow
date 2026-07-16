import { strict as assert } from "node:assert";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline";
import test from "node:test";
import { MAX_MCP_MESSAGE_BYTES } from "../src/platform/mcp/runtime/globalRouter";

test("packaged global Router speaks newline-delimited MCP over a real stdio process", async () => {
  const child = spawn(process.execPath, [path.join(process.cwd(), "out", "mcp-runtime", "mindflow-mcp-router.cjs")], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"]
  });
  const responses = responseReader(child);
  try {
    writeRequest(child, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "process-test", version: "1" } }
    });
    const initialized = await responses.next();
    assert.equal(initialized.value?.id, 1);
    assert.equal((initialized.value?.result as Record<string, unknown>).protocolVersion, "2024-11-05");
    const manifest = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf8"));
    assert.equal(((initialized.value?.result as Record<string, unknown>).serverInfo as Record<string, unknown>).version, manifest.version);

    writeRequest(child, { jsonrpc: "2.0", method: "notifications/initialized" });
    writeRequest(child, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    const listed = await responses.next();
    const tools = ((listed.value?.result as Record<string, unknown>).tools as Array<Record<string, unknown>>);
    assert.ok(tools.some((tool) => tool.name === "mindflow_list_hosts"));

    child.stdin.write(`${"x".repeat(MAX_MCP_MESSAGE_BYTES + 1)}\n`);
    const oversized = await responses.next();
    assert.equal((oversized.value?.error as Record<string, unknown>).code, -32600);
    assert.match(String((oversized.value?.error as Record<string, unknown>).message), /exceeds/);

    writeRequest(child, { jsonrpc: "2.0", id: 3, method: "ping" });
    const afterOversized = await responses.next();
    assert.equal(afterOversized.value?.id, 3);
  } finally {
    child.stdin.end();
    await waitForExit(child);
  }
});

function writeRequest(child: ChildProcessWithoutNullStreams, value: Record<string, unknown>): void {
  child.stdin.write(`${JSON.stringify(value)}\n`);
}

async function* responseReader(child: ChildProcessWithoutNullStreams): AsyncGenerator<Record<string, unknown>> {
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as Record<string, unknown>;
  }
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Router process exited with ${signal ?? code}: ${child.stderr.read()?.toString() ?? ""}`));
    });
  });
}
