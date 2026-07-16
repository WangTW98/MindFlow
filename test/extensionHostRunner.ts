import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { MINDFLOW_MCP_CONTRACT_VERSION } from "../src/platform/mcp/protocol/globalToolSchemas";
import { parseMindFlowSessionRecord } from "../src/platform/mcp/runtime/sessionRegistry";

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("mindflow.mindflow-canvas-editor");
  assert.ok(extension, "MindFlow development extension must be installed");
  await extension.activate();
  assert.equal(extension.isActive, true);

  const commands = await vscode.commands.getCommands(true);
  for (const command of ["mindflow.newFlow", "mindflow.copyGlobalMcpConfig", "mindflow.showMcpConnectionStatus"]) {
    assert.ok(commands.includes(command), `${command} must be registered`);
  }

  const mcpRoot = process.env.MINDFLOW_MCP_HOME;
  assert.ok(mcpRoot, "MINDFLOW_MCP_HOME must be isolated for extension tests");
  const sessionFile = await waitForSingleJson(path.join(mcpRoot, "sessions"));
  const record = parseMindFlowSessionRecord(JSON.parse(await fs.readFile(sessionFile, "utf8")), path.basename(sessionFile));
  assert.equal(record.contractVersion, MINDFLOW_MCP_CONTRACT_VERSION);

  const initialize = await post(record.endpoint, record.token, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "extension-host-test", version: "1" } }
  });
  assert.equal((initialize.result as Record<string, unknown>).protocolVersion, "2024-11-05");
  await post(record.endpoint, record.token, { jsonrpc: "2.0", method: "notifications/initialized" });
  const tools = await post(record.endpoint, record.token, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(Array.isArray((tools.result as Record<string, unknown>).tools));

  const routerPath = path.join(mcpRoot, "runtime", "mindflow-mcp-router.cjs");
  await waitForPath(routerPath);
  const manifestPath = path.join(mcpRoot, "runtime", "runtime.json");
  await waitForPath(manifestPath);
  const manifestMtime = (await fs.stat(manifestPath)).mtimeMs;
  await vscode.commands.executeCommand("mindflow.showMcpConnectionStatus");
  assert.equal((await fs.stat(manifestPath)).mtimeMs, manifestMtime, "unchanged runtime manifest must not be rewritten");
}

async function post(endpoint: string, token: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "X-MindFlow-Mcp-Client": "extension-host-test" },
    body: JSON.stringify(payload)
  });
  if (response.status === 202) return {};
  if (response.status !== 200) {
    const body = await response.text();
    assert.equal(response.status, 200, body);
  }
  return await response.json() as Record<string, unknown>;
}

async function waitForSingleJson(directory: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entries = await fs.readdir(directory).catch(() => []);
    const json = entries.filter((entry) => entry.endsWith(".json"));
    if (json.length === 1) return path.join(directory, json[0] as string);
    await delay(100);
  }
  throw new Error(`Timed out waiting for one session record in ${directory}`);
}

async function waitForPath(filePath: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await fs.stat(filePath).then(() => true, () => false)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
