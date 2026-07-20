import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";

test("source tree uses bounded product-flow and platform layers without legacy scopes", async () => {
  const root = process.cwd();
  const requiredDirectories = [
    "src/product-flow/domain",
    "src/product-flow/application/operations",
    "src/product-flow/infrastructure/persistence",
    "src/platform/vscode",
    "src/platform/webview",
    "src/platform/mcp",
    "src/shared",
    "assets/product-flow/schema",
    "assets/webview/canvas/media"
  ];
  const removedScopes = [
    "src/core",
    "src/models",
    "src/state",
    "src/extension",
    "src/storage",
    "src/user-operations",
    "src/utils",
    "src/domain",
    "src/application",
    "src/infrastructure",
    "src/adapters",
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

test("product-flow domain and application layers stay independent from platform adapters", async () => {
  const root = process.cwd();
  const domainSource = await readSources(path.join(root, "src", "product-flow", "domain"));
  assertNoForbiddenImport(domainSource, [
    "application",
    "infrastructure",
    "platform",
    "vscode",
    "mcp"
  ]);

  const applicationSource = await readSources(path.join(root, "src", "product-flow", "application"));
  assertNoForbiddenImport(applicationSource, [
    "infrastructure",
    "platform",
    "vscode",
    "webview"
  ]);
});

test("platform adapters use application operations instead of direct domain edits", async () => {
  const root = process.cwd();
  const platformSource = await readSources(path.join(root, "src", "platform"));
  const mcpSource = await readSources(path.join(root, "src", "platform", "mcp"));

  assert.equal(/from\s+["'][^"']*product-flow\/domain\/editing(?:\/|["'])/.test(platformSource), false);
  assert.ok(mcpSource.includes("product-flow/application/operations"));
});

test("MCP source uses host routing without workspace contract fields", async () => {
  const root = process.cwd();
  const mcpSource = [
    await readSources(path.join(root, "src", "platform", "mcp")),
    await readSources(path.join(root, "src", "platform", "vscode", "mcp"))
  ].join("\n");

  for (const removedContractName of ["mindflow_list_workspaces", "workspaceUri", "workspaceName", "toolsetHash"]) {
    assert.equal(mcpSource.includes(removedContractName), false, `${removedContractName} must not remain in the MCP implementation`);
  }
  assert.ok(mcpSource.includes("mindflow_list_hosts"));
  assert.ok(mcpSource.includes("hostId"));
  assert.ok(mcpSource.includes("contractHash"));
});

test("webview client source is TypeScript and bundle output is outside src", async () => {
  const root = process.cwd();
  const clientRoot = path.join(root, "src", "platform", "webview", "canvas", "client");
  const clientFiles = await listFiles(clientRoot);
  const clientTsFiles = clientFiles.filter((filePath) => filePath.endsWith(".ts"));
  const buildSource = await fs.readFile(path.join(root, "scripts", "build-webview.mjs"), "utf8");
  const clientSource = await readSources(clientRoot);

  assert.ok(clientTsFiles.length > 0);
  assert.deepEqual(clientFiles.filter((filePath) => filePath.endsWith(".js")), []);
  assert.equal(await pathExists(path.join(root, "src", "platform", "webview", "canvas", "manifest.mjs")), false);
  assert.equal(clientSource.includes("@ts-nocheck"), false);
  assert.ok(buildSource.includes("listTypeScriptSources"));
  assert.equal(buildSource.includes("canvas-client-source-order"), false);
  assert.ok(buildSource.includes("\"out\", \"webview\", \"canvas\""));
  assert.equal(buildSource.includes("src\", \"adapters\", \"webview\", \"canvas\", \"media\", \"dist\""), false);
});

test("VS Code webview host reads assets and bundled output, not browser client source", async () => {
  const root = process.cwd();
  const hostSource = await readSources(path.join(root, "src", "platform", "vscode", "editor"));

  assert.ok(hostSource.includes("\"assets\", \"webview\", \"canvas\", \"media\""));
  assert.ok(hostSource.includes("\"out\", \"webview\", \"canvas\""));
  assert.equal(/from\s+["'][^"']*webview\/canvas\/client/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*state\/canvas/.test(hostSource), false);
  assert.equal(/from\s+["'][^"']*user-operations\/canvas/.test(hostSource), false);
});

test("VS Code packaging ignores source and keeps assets", async () => {
  const ignoreSource = await fs.readFile(path.join(process.cwd(), ".vscodeignore"), "utf8");

  assert.ok(ignoreSource.includes("src/**"));
  assert.ok(ignoreSource.includes("assets/**"));
  assert.ok(ignoreSource.includes("!assets/product-flow/schema/**"));
  assert.ok(ignoreSource.includes("!assets/webview/media/**"));
  assert.ok(ignoreSource.includes("!assets/webview/canvas/media/**"));
  assert.ok(ignoreSource.includes("!assets/webview/sidebar/media/**"));
  assert.equal(ignoreSource.includes("src/adapters/"), false);
  assert.equal(ignoreSource.includes("src/platform/webview/canvas/client/**"), false);
});

test("test and package scripts launch JavaScript CLIs without Windows cmd shims", async () => {
  const root = process.cwd();
  const testRunner = await fs.readFile(path.join(root, "scripts", "run-tests.mjs"), "utf8");
  const packageChecker = await fs.readFile(path.join(root, "scripts", "check-package-contents.mjs"), "utf8");

  assert.ok(testRunner.includes('"node_modules", "typescript", "bin", "tsc"'));
  assert.ok(testRunner.includes('run(process.execPath, [tsc, "-p", "./", "--noEmit"])'));
  assert.equal(testRunner.includes("tsc.cmd"), false);
  assert.equal(testRunner.includes('"node_modules", ".bin"'), false);
  assert.ok(testRunner.includes("if (!process.env.NODE_V8_COVERAGE)"));
  assert.ok(testRunner.indexOf("if (!process.env.NODE_V8_COVERAGE)") < testRunner.indexOf('["--check"'));

  assert.ok(packageChecker.includes('"node_modules", "@vscode", "vsce", "vsce"'));
  assert.ok(packageChecker.includes("run(process.execPath, [vsce, \"ls\"])"));
  assert.equal(packageChecker.includes("vsce.cmd"), false);
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
  return (await listFiles(directory)).filter((filePath) => filePath.endsWith(".ts"));
}

async function listFiles(directory: string): Promise<string[]> {
  if (!await pathExists(directory)) {
    return [];
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
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
