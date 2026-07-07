import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";

test("MCP remains an adapter and non-MCP layers do not import it", async () => {
  const root = process.cwd();
  const forbiddenImporters = [
    path.join(root, "src", "core"),
    path.join(root, "src", "webview"),
    path.join(root, "src", "extension", "commands"),
    path.join(root, "src", "state"),
    path.join(root, "src", "user-operations")
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
  assert.equal(/from\s+["'][^"']*user-operations/.test(toolsSource), false);
  assert.equal(/\b(createManual|updateManual|removeManual)/.test(toolsSource), false);
  assert.deepEqual(violations, []);
});

test("state core and pure MCP layers stay independent from VS Code host surfaces", async () => {
  const root = process.cwd();
  const stateCoreSource = [
    await readSources(path.join(root, "src", "state", "operations")),
    await readSources(path.join(root, "src", "state", "product-flow")),
    await readSources(path.join(root, "src", "state", "selection")),
    await readSources(path.join(root, "src", "state", "storage")),
    await fs.readFile(path.join(root, "src", "state", "id.ts"), "utf8")
  ].join("\n");
  assertNoForbiddenImport(stateCoreSource, [
    "vscode",
    "webview",
    "mcp",
    "extension",
    "vscode-host"
  ]);

  const pureMcpSource = [
    await fs.readFile(path.join(root, "src", "mcp", "bridge.ts"), "utf8"),
    await fs.readFile(path.join(root, "src", "mcp", "operationsReference.ts"), "utf8"),
    await fs.readFile(path.join(root, "src", "mcp", "protocol.ts"), "utf8"),
    await fs.readFile(path.join(root, "src", "mcp", "toolSchemas.ts"), "utf8"),
    await readSources(path.join(root, "src", "mcp", "tools"))
  ].join("\n");
  assertNoForbiddenImport(pureMcpSource, [
    "vscode",
    "webview",
    "extension",
    "vscode-host",
    "user-operations"
  ]);
});

test("webview canvas source manifest matches the structured canvas directories", async () => {
  const root = process.cwd();
  const manifestPath = path.join(root, "src", "canvas", "manifest.mjs");
  const manifestSource = await fs.readFile(manifestPath, "utf8");
  const sourceFiles = Array.from(manifestSource.matchAll(/"([^"]+\.js)"/g), (match) => match[1])
    .filter((sourceFile): sourceFile is string => typeof sourceFile === "string");
  const allowedPrefixes = [
    "canvas/bootstrap/",
    "canvas/layout/",
    "canvas/render/",
    "canvas/selectors/",
    "state/canvas/",
    "user-operations/canvas/commands/",
    "user-operations/canvas/interactions/"
  ];
  const seenFunctions = new Map<string, string>();
  const duplicateFunctions: string[] = [];

  assert.ok(sourceFiles.length > 0);
  assert.equal(manifestSource.includes("webview/canvas"), false);

  for (const sourceFile of sourceFiles) {
    assert.ok(allowedPrefixes.some((prefix) => sourceFile.startsWith(prefix)), `${sourceFile} must live in a structured canvas directory`);
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
      } else if (name) {
        seenFunctions.set(name, sourceFile);
      }
    }
  }

  const buildSource = await fs.readFile(path.join(root, "scripts", "build-webview.mjs"), "utf8");
  assert.ok(buildSource.includes("root, \"src\""));
  assert.deepEqual(duplicateFunctions, []);
});

test("extension webview host does not import browser canvas source files", async () => {
  const root = process.cwd();
  const hostSource = await readSources(path.join(root, "src", "vscode", "webviews"));

  assert.equal(/from\s+["'][^"']*canvas\/(?:bootstrap|layout|render|selectors)/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*state\/canvas/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*user-operations\/canvas/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*canvas\/media/.test(hostSource), false);
});

test("VS Code packaging ignores canvas source and keeps bundled media", async () => {
  const ignoreSource = await fs.readFile(path.join(process.cwd(), ".vscodeignore"), "utf8");

  assert.ok(ignoreSource.includes("src/canvas/bootstrap/**"));
  assert.ok(ignoreSource.includes("src/canvas/render/**"));
  assert.ok(ignoreSource.includes("src/state/canvas/**"));
  assert.ok(ignoreSource.includes("src/user-operations/canvas/**"));
  assert.ok(ignoreSource.includes("!src/canvas/media/**"));
  assert.equal(ignoreSource.includes("src/webview/canvas/**"), false);
  assert.equal(ignoreSource.includes("src/webview/client/**"), false);
});

test("legacy compatibility re-export shims remain explicit and bounded", async () => {
  const root = process.cwd();
  const compatibilityFiles = [
    path.join(root, "src", "extension.ts"),
    ...await listTypeScriptFiles(path.join(root, "src", "core")),
    ...await listTypeScriptFiles(path.join(root, "src", "models")),
    ...await listTypeScriptFiles(path.join(root, "src", "domain")),
    ...await listTypeScriptFiles(path.join(root, "src", "extension")),
    ...await listTypeScriptFiles(path.join(root, "src", "webview")),
    ...await listTypeScriptFiles(path.join(root, "src", "storage")),
    ...await listTypeScriptFiles(path.join(root, "src", "utils"))
  ].sort();

  assert.ok(compatibilityFiles.length > 70);
  const nonShims = await Promise.all(compatibilityFiles.map(async (filePath) => {
    const source = await fs.readFile(filePath, "utf8");
    return isReExportShim(source) ? [] : [path.relative(root, filePath)];
  }));
  assert.deepEqual(nonShims.flat(), []);
  assert.deepEqual(await listJavaScriptFiles(path.join(root, "src", "webview")), []);
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

async function listJavaScriptFiles(directory: string): Promise<string[]> {
  if (!await pathExists(directory)) {
    return [];
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  }));
  return nested.flat().sort();
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
    if (name === "vscode-host") {
      return /from\s+["'][^"']*(?:^|\/)vscode(?:\/|["'])/.test(source);
    }
    return new RegExp(`from\\s+["'][^"']*(?:^|/)${name}(?:/|["'])`).test(source);
  });
  assert.deepEqual(violations, []);
}
