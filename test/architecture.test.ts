import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";

test("MCP remains an adapter and non-MCP layers do not import it", async () => {
  const root = process.cwd();
  const forbiddenImporters = [
    path.join(root, "src", "core"),
    path.join(root, "src", "webview"),
    path.join(root, "src", "extension", "commands")
  ];
  const violations: string[] = [];

  for (const directory of forbiddenImporters) {
    for (const filePath of await listTypeScriptFiles(directory)) {
      const source = await fs.readFile(filePath, "utf8");
      if (/from\s+["'][^"']*\/mcp(?:\/|["'])/.test(source)) {
        violations.push(path.relative(root, filePath));
      }
    }
  }

  const toolsSource = await fs.readFile(path.join(root, "src", "mcp", "tools.ts"), "utf8");
  assert.equal(/from\s+["'][^"']*webview/.test(toolsSource), false);
  assert.equal(/from\s+["'][^"']*extension\/commands/.test(toolsSource), false);
  assert.equal(/\b(createManual|updateManual|removeManual)/.test(toolsSource), false);
  assert.deepEqual(violations, []);
});

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  }));
  return nested.flat().sort();
}
