import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDirectory = path.join(root, "out", "mcp-runtime");
const outputFile = path.join(outputDirectory, "mindflow-mcp-router.cjs");

await fs.mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [path.join(root, "src", "platform", "mcp", "runtime", "globalRouterEntry.ts")],
  outfile: outputFile,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: false,
  legalComments: "none",
  logLevel: "silent"
});

const stat = await fs.stat(outputFile);
console.log(`Built ${path.relative(root, outputFile)} (${stat.size} bytes)`);
