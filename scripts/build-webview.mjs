import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clientRoot = path.join(root, "src", "platform", "webview", "canvas", "client");
const outputDir = path.join(root, "out", "webview", "canvas");
const outputFile = path.join(outputDir, "flowEditor.js");

await fs.mkdir(outputDir, { recursive: true });

const sourceFiles = (await listTypeScriptSources(clientRoot)).sort(compareClientSources);
const chunks = [];
for (const sourcePath of sourceFiles) {
  const source = await fs.readFile(sourcePath, "utf8");
  chunks.push(`\n/* ${path.relative(clientRoot, sourcePath)} */\n${source}`);
}

await build({
  stdin: {
    contents: `(() => {${chunks.join("\n")}\n})();\n`,
    loader: "ts",
    sourcefile: "flowEditor.entry.ts"
  },
  outfile: outputFile,
  bundle: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: false,
  legalComments: "none",
  logLevel: "silent"
});

const stat = await fs.stat(outputFile);
console.log(`Built ${path.relative(root, outputFile)} (${stat.size} bytes)`);

async function listTypeScriptSources(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptSources(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [absolutePath] : [];
  }));
  return nested.flat();
}

function compareClientSources(left, right) {
  const leftRelative = path.relative(clientRoot, left).replaceAll(path.sep, "/");
  const rightRelative = path.relative(clientRoot, right).replaceAll(path.sep, "/");
  return sourcePriority(leftRelative) - sourcePriority(rightRelative) || leftRelative.localeCompare(rightRelative);
}

function sourcePriority(fileName) {
  const bootstrapOrder = [
    "bootstrap/canvas-namespace.ts",
    "bootstrap/canvas-dom.ts",
    "bootstrap/canvas-boot-helpers.ts",
    "state/canvas-constants.ts",
    "state/canvas-host-state.ts",
    "state/canvas-selection-state.ts",
    "state/canvas-filter-state.ts",
    "state/canvas-drag-state.ts",
    "state/canvas-persistence-state.ts"
  ];
  const bootstrapIndex = bootstrapOrder.indexOf(fileName);
  if (bootstrapIndex >= 0) {
    return bootstrapIndex;
  }
  return fileName === "state/main.ts" ? 100 : 50;
}
