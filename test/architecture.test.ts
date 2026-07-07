import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";

test("source tree uses the canonical functional layers without legacy scopes", async () => {
  const root = process.cwd();
  const requiredDirectories = [
    "src/domain",
    "src/persistence",
    "src/vscode",
    "src/webview",
    "src/mcp"
  ];
  const removedScopes = [
    "src/core",
    "src/models",
    "src/state",
    "src/extension",
    "src/storage",
    "src/user-operations",
    "src/utils",
    "src/extension.ts"
  ];

  for (const directory of requiredDirectories) {
    assert.equal(await pathExists(path.join(root, directory)), true, `${directory} should exist`);
  }
  for (const legacyPath of removedScopes) {
    assert.equal(await pathExists(path.join(root, legacyPath)), false, `${legacyPath} should not remain`);
  }
});

test("domain and pure MCP layers stay independent from adapters and UI", async () => {
  const root = process.cwd();
  const domainSource = await readSources(path.join(root, "src", "domain"));
  assertNoForbiddenImport(domainSource, [
    "vscode",
    "webview",
    "mcp",
    "persistence"
  ]);

  const pureMcpSource = await readSources(path.join(root, "src", "mcp"));
  assertNoForbiddenImport(pureMcpSource, [
    "vscode",
    "webview",
    "persistence"
  ]);
});

test("VS Code adapter owns commands, host state, and the VS Code MCP bridge", async () => {
  const root = process.cwd();
  assert.equal(await pathExists(path.join(root, "src", "vscode", "commands")), true);
  assert.equal(await pathExists(path.join(root, "src", "vscode", "state")), true);
  assert.equal(await pathExists(path.join(root, "src", "vscode", "mcp")), true);

  const vscodeSource = await readSources(path.join(root, "src", "vscode"));
  assert.equal(/from\s+["'][^"']*user-operations(?:\/|["'])/.test(vscodeSource), false);
  assert.equal(/from\s+["'][^"']*extension(?:\/|["'])/.test(vscodeSource), false);
});

test("webview canvas source manifest matches the structured client directories", async () => {
  const root = process.cwd();
  const manifestPath = path.join(root, "src", "webview", "canvas", "manifest.mjs");
  const manifestSource = await fs.readFile(manifestPath, "utf8");
  const sourceFiles = Array.from(manifestSource.matchAll(/"([^"]+\.js)"/g), (match) => match[1])
    .filter((sourceFile): sourceFile is string => typeof sourceFile === "string");
  const allowedPrefixes = [
    "webview/canvas/client/bootstrap/",
    "webview/canvas/client/layout/",
    "webview/canvas/client/render/",
    "webview/canvas/client/selectors/",
    "webview/canvas/client/state/",
    "webview/canvas/client/commands/",
    "webview/canvas/client/interactions/"
  ];
  const seenFunctions = new Map<string, string>();
  const duplicateFunctions: string[] = [];

  assert.ok(sourceFiles.length > 0);
  assert.equal(/(?:^|")canvas\/(?:bootstrap|layout|render|selectors)\//.test(manifestSource), false);
  assert.equal(manifestSource.includes("state/canvas/"), false);
  assert.equal(manifestSource.includes("user-operations/canvas/"), false);

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
  assert.ok(buildSource.includes("src\", \"webview\", \"canvas\", \"media\", \"dist\""));
  assert.deepEqual(duplicateFunctions, []);
});

test("VS Code webview host does not import browser canvas source files", async () => {
  const root = process.cwd();
  const hostSource = await readSources(path.join(root, "src", "vscode", "webviews"));

  assert.equal(/from\s+["'][^"']*webview\/canvas\/client/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*canvas\/(?:bootstrap|layout|render|selectors)/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*state\/canvas/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*user-operations\/canvas/.test(hostSource), false);
});

test("VS Code packaging ignores webview client source and keeps media assets", async () => {
  const ignoreSource = await fs.readFile(path.join(process.cwd(), ".vscodeignore"), "utf8");

  assert.ok(ignoreSource.includes("src/webview/canvas/client/**"));
  assert.ok(ignoreSource.includes("src/webview/canvas/manifest.mjs"));
  assert.ok(ignoreSource.includes("!src/webview/media/**"));
  assert.ok(ignoreSource.includes("!src/webview/canvas/media/**"));
  assert.ok(ignoreSource.includes("!src/webview/sidebar/media/**"));
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
