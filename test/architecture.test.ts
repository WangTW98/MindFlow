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
  const allowedRoots = new Set(["bootstrap", "commands", "interactions", "layout", "render", "selectors", "state"]);
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

test("legacy compatibility re-export shims remain explicit and bounded", async () => {
  const root = process.cwd();
  const shims = [
    ...await listReExportShims([
    path.join(root, "src", "core"),
    path.join(root, "src", "models")
    ]),
    ...await listRootReExportShims(path.join(root, "src", "webview")),
    ...await listReExportShims([
      path.join(root, "src", "webview", "sidebar")
    ]).then((files) => files.filter((filePath) => /sidebar(?:Html|State)\.ts$/.test(filePath)))
  ].sort();

  assert.deepEqual(shims.map((filePath) => path.relative(root, filePath)), [
    "src/core/appSurfaceEntryEdges.ts",
    "src/core/canvasLayout.ts",
    "src/core/editorSelection.ts",
    "src/core/emptyFlow.ts",
    "src/core/flowEditing.ts",
    "src/core/flowEditing/edges.ts",
    "src/core/flowEditing/endpoints.ts",
    "src/core/flowEditing/featureGroups.ts",
    "src/core/flowEditing/index.ts",
    "src/core/flowEditing/nodes.ts",
    "src/core/flowEditing/shared.ts",
    "src/core/flowEditing/types.ts",
    "src/core/flowOperations/index.ts",
    "src/core/projectOverview.ts",
    "src/core/taxonomy.ts",
    "src/core/taxonomy/appSurfaces.ts",
    "src/core/taxonomy/domains.ts",
    "src/core/taxonomy/helpers.ts",
    "src/core/taxonomy/roles.ts",
    "src/core/taxonomy/statusGroups.ts",
    "src/core/taxonomy/types.ts",
    "src/core/taxonomyEditing.ts",
    "src/core/untitledMindFlowDocument.ts",
    "src/models/productFlow.ts",
    "src/models/productFlow/constants.ts",
    "src/models/productFlow/guards.ts",
    "src/models/productFlow/index.ts",
    "src/models/productFlow/types.ts",
    "src/models/productFlow/validation.ts",
    "src/models/productFlow/validation/collections.ts",
    "src/models/productFlow/validation/endpoints.ts",
    "src/models/productFlow/validation/entities.ts",
    "src/models/productFlow/validation/primitives.ts",
    "src/models/productFlowCodec.ts",
    "src/models/productFlowSaveGuard.ts",
    "src/webview/FlowEditorSession.ts",
    "src/webview/FlowPanel.ts",
    "src/webview/SidebarView.ts",
    "src/webview/flowCommandDispatcher.ts",
    "src/webview/flowDocument.ts",
    "src/webview/flowDocumentText.ts",
    "src/webview/flowMessageOrdering.ts",
    "src/webview/flowSelection.ts",
    "src/webview/flowSelectionController.ts",
    "src/webview/flowWebviewHtml.ts",
    "src/webview/flowWebviewState.ts",
    "src/webview/sidebar/sidebarHtml.ts",
    "src/webview/sidebar/sidebarState.ts"
  ]);
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

async function listReExportShims(directories: string[]): Promise<string[]> {
  const nested = await Promise.all(directories.map(async (directory) => {
    const files = await listTypeScriptFiles(directory);
    const shims = await Promise.all(files.map(async (filePath) => {
      const source = await fs.readFile(filePath, "utf8");
      const trimmed = source.trim();
      return trimmed.startsWith("export") && !/\bimport\b/.test(source) ? [filePath] : [];
    }));
    return shims.flat();
  }));
  return nested.flat().sort();
}

async function listRootReExportShims(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(directory, entry.name));
  const shims = await Promise.all(files.map(async (filePath) => {
    const source = await fs.readFile(filePath, "utf8");
    const trimmed = source.trim();
    return trimmed.startsWith("export") && !/\bimport\b/.test(source) ? [filePath] : [];
  }));
  return shims.flat().sort();
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
