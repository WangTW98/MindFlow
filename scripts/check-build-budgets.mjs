import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const budgets = [
  ["out/platform/vscode/extension.js", 400 * 1024],
  ["out/platform/vscode/extension.js.map", 500 * 1024],
  ["out/mcp-runtime/mindflow-mcp-router.cjs", 100 * 1024],
  ["out/mcp-runtime/mindflow-mcp-router.cjs.map", 200 * 1024],
  ["out/webview/canvas/flowEditor.js", 350 * 1024],
  ["out/webview/canvas/flowEditor.js.map", 400 * 1024]
];

for (const [relativePath, maximumBytes] of budgets) {
  const stat = await fs.stat(path.join(root, relativePath));
  if (stat.size > maximumBytes) {
    throw new Error(`${relativePath} is ${stat.size} bytes; build budget is ${maximumBytes} bytes.`);
  }
  console.log(`${relativePath}: ${stat.size}/${maximumBytes} bytes`);
}
