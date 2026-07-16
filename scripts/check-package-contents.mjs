import { spawn } from "node:child_process";

const requiredFiles = new Set([
  "package.json",
  "README.md",
  "LICENSE.txt",
  "out/mcp-runtime/mindflow-mcp-router.cjs",
  "out/mcp-runtime/mindflow-mcp-router.cjs.map",
  "out/webview/canvas/flowEditor.js",
  "out/webview/canvas/flowEditor.js.map",
  "out/platform/vscode/extension.js",
  "out/platform/vscode/extension.js.map",
  "assets/product-flow/schema/productFlow.schema.json",
  "assets/webview/media/icon.svg",
  "assets/webview/sidebar/media/sidebar.css"
]);
const allowedPrefixes = [
  "assets/webview/canvas/media/"
];

const listing = await run(process.platform === "win32" ? "vsce.cmd" : "vsce", ["ls"]);
const files = listing.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
const unexpected = files.filter((file) => !requiredFiles.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)));
const missing = [...requiredFiles].filter((file) => !files.includes(file));

if (unexpected.length || missing.length) {
  throw new Error([
    unexpected.length ? `Unexpected VSIX files:\n${unexpected.join("\n")}` : "",
    missing.length ? `Missing VSIX files:\n${missing.join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

console.log(`VSIX content whitelist passed (${files.length} files).`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr}`)));
  });
}
