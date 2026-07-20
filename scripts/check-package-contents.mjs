import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vsce = path.join(root, "node_modules", "@vscode", "vsce", "vsce");

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
  "assets/webview/canvas/media/",
  "agent-assets/skills/"
];

const listing = await run(process.execPath, [vsce, "ls"]);
const files = listing.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
const unexpected = files.filter((file) => !requiredFiles.has(file) && !allowedPrefixes.some((prefix) => file.startsWith(prefix)));
const missing = [...requiredFiles].filter((file) => !files.includes(file));

if (unexpected.length || missing.length) {
  throw new Error([
    unexpected.length ? `Unexpected VSIX files:\n${unexpected.join("\n")}` : "",
    missing.length ? `Missing VSIX files:\n${missing.join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

const [manifestText, licenseText, readmeText] = await Promise.all([
  fs.readFile(path.join(root, "package.json"), "utf8"),
  fs.readFile(path.join(root, "LICENSE.txt"), "utf8"),
  fs.readFile(path.join(root, "README.md"), "utf8")
]);
const manifest = JSON.parse(manifestText);
const repositoryUrl = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
const normalizedLicenseText = licenseText.replace(/\r\n?/gu, "\n");
const licensingErrors = [
  manifest.license === "AGPL-3.0-only" ? "" : "package.json must declare AGPL-3.0-only",
  repositoryUrl === "https://github.com/WangTW98/MindFlow.git" ? "" : "package.json must point to the public MindFlow source repository",
  normalizedLicenseText.includes("GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007") ? "" : "LICENSE.txt must contain the complete GNU AGPL v3 text",
  /All rights reserved|proprietary|No permission is granted|UNLICENSED/iu.test(normalizedLicenseText) ? "LICENSE.txt still contains proprietary licensing terms" : "",
  readmeText.includes("## License") && readmeText.includes("AGPL-3.0-only") ? "" : "README.md must describe the AGPL-3.0-only license"
].filter(Boolean);

if (licensingErrors.length) {
  throw new Error(`VSIX licensing checks failed:\n${licensingErrors.join("\n")}`);
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
