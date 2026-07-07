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

  const toolsSource = await readSources(path.join(root, "src", "mcp", "tools"));
  assert.equal(/from\s+["'][^"']*webview/.test(toolsSource), false);
  assert.equal(/from\s+["'][^"']*extension\/commands/.test(toolsSource), false);
  assert.equal(/\b(createManual|updateManual|removeManual)/.test(toolsSource), false);
  assert.deepEqual(violations, []);
});

test("domain and pure MCP layers stay independent from VS Code host surfaces", async () => {
  const root = process.cwd();
  const domainSource = await readSources(path.join(root, "src", "domain"));
  assertNoForbiddenImport(domainSource, [
    "vscode",
    "webview",
    "mcp",
    "extension"
  ]);

  const pureMcpSource = [
    await fs.readFile(path.join(root, "src", "mcp", "protocol.ts"), "utf8"),
    await readSources(path.join(root, "src", "mcp", "tools"))
  ].join("\n");
  assertNoForbiddenImport(pureMcpSource, [
    "vscode",
    "webview",
    "extension"
  ]);
});

test("webview canvas source manifest matches the structured canvas directories", async () => {
  const root = process.cwd();
  const manifestPath = path.join(root, "src", "webview", "canvas", "manifest.mjs");
  const manifestSource = await fs.readFile(manifestPath, "utf8");
  const sourceFiles = Array.from(manifestSource.matchAll(/"([^"]+\.js)"/g), (match) => match[1])
    .filter((sourceFile): sourceFile is string => typeof sourceFile === "string");
  const allowedRoots = new Set(["bootstrap", "commands", "interactions", "render", "selectors", "state"]);
  const seenFunctions = new Map<string, string>();
  const duplicateFunctions: string[] = [];

  assert.ok(sourceFiles.length > 0);
  assert.equal(manifestSource.includes("webview/client"), false);

  for (const sourceFile of sourceFiles) {
    const [sourceRoot] = sourceFile.split("/");
    assert.ok(sourceRoot && allowedRoots.has(sourceRoot), `${sourceFile} must live in a structured canvas directory`);
    const absolutePath = path.join(root, "src", "webview", "canvas", sourceFile);
    const source = await fs.readFile(absolutePath, "utf8");
    for (const match of source.matchAll(/^function\s+([A-Za-z0-9_]+)/gm)) {
      const name = match[1];
      if (!name) {
        continue;
      }
      const previous = seenFunctions.get(name);
      if (previous) {
        duplicateFunctions.push(`${name}: ${previous}, ${sourceFile}`);
      } else if (name) {
        seenFunctions.set(name, sourceFile);
      }
    }
  }

  const buildSource = await fs.readFile(path.join(root, "scripts", "build-webview.mjs"), "utf8");
  assert.ok(buildSource.includes("src\", \"webview\", \"canvas\""));
  assert.deepEqual(duplicateFunctions, []);
});

test("extension webview host does not import browser canvas source files", async () => {
  const root = process.cwd();
  const hostSource = await readSources(path.join(root, "src", "extension", "webviews"));

  assert.equal(/from\s+["'][^"']*webview\/canvas/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*webview\/media/.test(hostSource), false);
});

test("VS Code packaging ignores canvas source and keeps bundled media", async () => {
  const ignoreSource = await fs.readFile(path.join(process.cwd(), ".vscodeignore"), "utf8");

  assert.ok(ignoreSource.includes("src/webview/canvas/**"));
  assert.ok(ignoreSource.includes("!src/webview/media/**"));
  assert.equal(ignoreSource.includes("src/webview/client/**"), false);
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

async function readSources(directory: string): Promise<string> {
  const files = await listTypeScriptFiles(directory);
  const sources = await Promise.all(files.map((filePath) => fs.readFile(filePath, "utf8")));
  return sources.join("\n");
}

function assertNoForbiddenImport(source: string, forbidden: string[]): void {
  const violations = forbidden.filter((name) => {
    if (name === "vscode") {
      return /from\s+["']vscode["']/.test(source) || /import\s+["']vscode["']/.test(source);
    }
    return new RegExp(`from\\s+["'][^"']*(?:^|/)${name}(?:/|["'])`).test(source);
  });
  assert.deepEqual(violations, []);
}
