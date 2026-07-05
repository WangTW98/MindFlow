import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { FLOW_CLIENT_SOURCE_FILES } from "../src/webview/client/manifest.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const clientRoot = path.join(root, "src", "webview", "client");
const outputDir = path.join(root, "src", "webview", "media", "dist");
const tempDir = path.join(root, "out", ".webview");
const tempInput = path.join(tempDir, "flowEditor.input.js");
const outputFile = path.join(outputDir, "flowEditor.js");

await fs.mkdir(tempDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const chunks = [];
for (const fileName of FLOW_CLIENT_SOURCE_FILES) {
  const sourcePath = path.join(clientRoot, fileName);
  const source = await fs.readFile(sourcePath, "utf8");
  chunks.push(`\n/* ${fileName} */\n${source}`);
}

await fs.writeFile(tempInput, `(() => {${chunks.join("\n")}\n})();\n`, "utf8");
await build({
  entryPoints: [tempInput],
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
