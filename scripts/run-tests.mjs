import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tsc = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");

await run(process.execPath, ["scripts/build-webview.mjs"]);
await run(process.execPath, ["scripts/build-mcp-router.mjs"]);
await run(tsc, ["-p", "./", "--noEmit"]);
for (const script of await listJavaScriptFiles(path.join(root, "out", "webview", "canvas"))) {
  await run(process.execPath, ["--check", path.relative(root, script)]);
}
await fs.rm(path.join(root, "out-test"), { recursive: true, force: true });
await run(tsc, ["-p", "./tsconfig.test.json"]);
await run(process.execPath, ["--test", ...(await listJavaScriptFiles(path.join(root, "out-test", "test")))
  .filter((script) => script.endsWith(".test.js"))
  .map((script) => path.relative(root, script))
]);

async function listJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  }));
  return files.flat().sort();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
    });
  });
}
