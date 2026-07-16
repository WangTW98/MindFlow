import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputFile = path.join(root, "out", "platform", "vscode", "extension.js");
const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

await fs.mkdir(path.dirname(outputFile), { recursive: true });
await build({
  entryPoints: [path.join(root, "src", "platform", "vscode", "extension.ts")],
  outfile: outputFile,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  define: { __MINDFLOW_VERSION__: JSON.stringify(manifest.version) },
  sourcemap: true,
  sourcesContent: false,
  legalComments: "none",
  logLevel: "silent"
});

const stat = await fs.stat(outputFile);
console.log(`Built ${path.relative(root, outputFile)} (${stat.size} bytes)`);
