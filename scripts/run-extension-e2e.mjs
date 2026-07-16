import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-extension-e2e-"));
const workspace = path.join(temporaryRoot, "workspace");
const mcpHome = path.join(temporaryRoot, "mcp");
await fs.mkdir(workspace, { recursive: true });

try {
  await runTests({
    version: "stable",
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, "out-test", "test", "extensionHostRunner.js"),
    extensionTestsEnv: { MINDFLOW_MCP_HOME: mcpHome },
    launchArgs: [workspace, "--disable-extensions", "--disable-gpu"]
  });
  await waitForSessionCleanup(path.join(mcpHome, "sessions"));
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

async function waitForSessionCleanup(directory) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const entries = await fs.readdir(directory).catch(() => []);
    if (!entries.some((entry) => entry.endsWith(".json"))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("MindFlow session record was not removed after Extension Host shutdown.");
}
