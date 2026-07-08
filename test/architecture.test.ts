import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";

test("source tree uses the canonical functional layers without legacy scopes", async () => {
  const root = process.cwd();
  const requiredDirectories = [
    "src/domain/product-flow",
    "src/application/flow-operations",
    "src/infrastructure/persistence",
    "src/adapters/vscode",
    "src/adapters/webview",
    "src/adapters/mcp"
  ];
  const removedScopes = [
    "src/core",
    "src/models",
    "src/state",
    "src/extension",
    "src/storage",
    "src/user-operations",
    "src/utils",
    "src/extension.ts",
    "src/domain/operations",
    "src/domain/schema",
    "src/domain/selection",
    "src/persistence",
    "src/vscode",
    "src/webview",
    "src/mcp"
  ];

  for (const directory of requiredDirectories) {
    assert.equal(await pathExists(path.join(root, directory)), true, `${directory} should exist`);
  }
  for (const legacyPath of removedScopes) {
    assert.equal(await pathExists(path.join(root, legacyPath)), false, `${legacyPath} should not remain`);
  }
});

test("domain and application layers stay independent from adapters and infrastructure", async () => {
  const root = process.cwd();
  const domainSource = await readSources(path.join(root, "src", "domain"));
  assertNoForbiddenImport(domainSource, [
    "application",
    "adapters",
    "infrastructure",
    "vscode",
    "mcp"
  ]);

  const applicationSource = await readSources(path.join(root, "src", "application"));
  assertNoForbiddenImport(applicationSource, [
    "adapters",
    "infrastructure",
    "vscode",
    "webview"
  ]);
});

test("VS Code adapter owns commands, host state, and the VS Code MCP bridge", async () => {
  const root = process.cwd();
  assert.equal(await pathExists(path.join(root, "src", "adapters", "vscode", "commands")), true);
  assert.equal(await pathExists(path.join(root, "src", "adapters", "vscode", "state")), true);
  assert.equal(await pathExists(path.join(root, "src", "adapters", "vscode", "mcp")), true);

  const vscodeSource = await readSources(path.join(root, "src", "adapters", "vscode"));
  assert.equal(/from\s+["'][^"']*user-operations(?:\/|["'])/.test(vscodeSource), false);
  assert.equal(/from\s+["'][^"']*flowContext(?:\/|["'])/.test(vscodeSource), false);
  assert.equal(/from\s+["'][^"']*domain\/product-flow\/editing(?:\/|["'])/.test(vscodeSource), false);
});

test("MCP adapter uses application flow operations instead of direct domain edits", async () => {
  const root = process.cwd();
  const mcpSource = await readSources(path.join(root, "src", "adapters", "mcp"));

  assert.equal(/from\s+["'][^"']*domain\/product-flow\/editing(?:\/|["'])/.test(mcpSource), false);
  assert.ok(mcpSource.includes("application/flow-operations"));
});

test("webview canvas source manifest matches the structured client directories", async () => {
  const root = process.cwd();
  const manifestPath = path.join(root, "src", "adapters", "webview", "canvas", "manifest.mjs");
  const manifestSource = await fs.readFile(manifestPath, "utf8");
  const sourceFiles = Array.from(manifestSource.matchAll(/"([^"]+\.js)"/g), (match) => match[1])
    .filter((sourceFile): sourceFile is string => typeof sourceFile === "string");
  const allowedPrefixes = [
    "adapters/webview/canvas/runtime/bootstrap/",
    "adapters/webview/canvas/runtime/layout/",
    "adapters/webview/canvas/runtime/rendering/",
    "adapters/webview/canvas/runtime/data/",
    "adapters/webview/canvas/runtime/state/",
    "adapters/webview/canvas/runtime/host/",
    "adapters/webview/canvas/runtime/interactions/"
  ];
  const seenFunctions = new Map<string, string>();
  const duplicateFunctions: string[] = [];

  assert.ok(sourceFiles.length > 0);
  assert.equal(/(?:^|")webview\/canvas\/client\//.test(manifestSource), false);
  assert.equal(manifestSource.includes("state/canvas/"), false);
  assert.equal(manifestSource.includes("user-operations/canvas/"), false);
  assert.equal(sourceFiles.includes("adapters/webview/canvas/runtime/layout/canvas-auto-layout.js"), false);
  assert.deepEqual(sourceFiles.filter((sourceFile) => sourceFile.startsWith("adapters/webview/canvas/runtime/layout/")), [
    "adapters/webview/canvas/runtime/layout/canvas-auto-layout-engine.js",
    "adapters/webview/canvas/runtime/layout/canvas-auto-layout-preview-state.js",
    "adapters/webview/canvas/runtime/layout/canvas-auto-layout-dom.js"
  ]);

  for (const sourceFile of sourceFiles) {
    assert.ok(allowedPrefixes.some((prefix) => sourceFile.startsWith(prefix)), `${sourceFile} must live in a structured webview client directory`);
    const absolutePath = path.join(root, "src", sourceFile);
    const source = await fs.readFile(absolutePath, "utf8");
    for (const match of source.matchAll(/^function\s+([A-Za-z0-9_]+)/gm)) {
      const name = match[1];
      if (!name) {
        continue;
      }
      const previous = seenFunctions.get(name);
      if (previous) {
        duplicateFunctions.push(`${name}: ${previous}, ${sourceFile}`);
      } else {
        seenFunctions.set(name, sourceFile);
      }
    }
  }

  const buildSource = await fs.readFile(path.join(root, "scripts", "build-webview.mjs"), "utf8");
  assert.ok(buildSource.includes("src\", \"adapters\", \"webview\", \"canvas\", \"media\", \"dist\""));
  assert.deepEqual(duplicateFunctions, []);
});

test("VS Code webview host does not import browser canvas source files", async () => {
  const root = process.cwd();
  const hostSource = await readSources(path.join(root, "src", "adapters", "vscode", "editor"));

  assert.equal(/from\s+["'][^"']*webview\/canvas\/runtime/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*canvas\/runtime\/(?:bootstrap|layout|rendering|data)/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*state\/canvas/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*user-operations\/canvas/.test(hostSource), false);
});

test("VS Code packaging ignores webview client source and keeps media assets", async () => {
  const ignoreSource = await fs.readFile(path.join(process.cwd(), ".vscodeignore"), "utf8");

  assert.ok(ignoreSource.includes("src/adapters/webview/canvas/runtime/**"));
  assert.ok(ignoreSource.includes("src/adapters/webview/canvas/manifest.mjs"));
  assert.ok(ignoreSource.includes("!src/adapters/webview/media/**"));
  assert.ok(ignoreSource.includes("!src/adapters/webview/canvas/media/**"));
  assert.ok(ignoreSource.includes("!src/adapters/webview/sidebar/media/**"));
  assert.equal(ignoreSource.includes("src/canvas/"), false);
  assert.equal(ignoreSource.includes("src/state/canvas"), false);
  assert.equal(ignoreSource.includes("src/user-operations/canvas"), false);
});

test("legacy compatibility re-export shims are removed", async () => {
  const root = process.cwd();
  const shimFiles: string[] = [];

  for (const filePath of await listTypeScriptFiles(path.join(root, "src"))) {
    const source = await fs.readFile(filePath, "utf8");
    if (isReExportShim(source)) {
      shimFiles.push(path.relative(root, filePath));
    }
  }

  assert.deepEqual(shimFiles, []);
});

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  if (!await pathExists(directory)) {
    return [];
  }
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

function isReExportShim(source: string): boolean {
  return /^export \* from "[^"]+";\n?$/.test(source.trim());
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
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
