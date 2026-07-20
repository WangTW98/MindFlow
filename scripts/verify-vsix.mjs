import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const options = readOptions(process.argv.slice(2));
const manifest = JSON.parse(await readEntry(options.vsix, "extension/package.json"));
const [packagedLicense, packagedReadme, extensionBundle, routerBundle, sourceLicense] = await Promise.all([
  readEntry(options.vsix, "extension/LICENSE.txt"),
  readEntry(options.vsix, "extension/readme.md"),
  readEntry(options.vsix, "extension/out/platform/vscode/extension.js"),
  readEntry(options.vsix, "extension/out/mcp-runtime/mindflow-mcp-router.cjs"),
  fs.readFile(path.join(root, "LICENSE.txt"), "utf8")
]);
const repositoryUrl = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
const failures = [
  manifest.version === options.version ? "" : `VSIX version ${manifest.version} does not match ${options.version}`,
  manifest.license === "AGPL-3.0-only" ? "" : "VSIX manifest does not declare AGPL-3.0-only",
  repositoryUrl === "https://github.com/WangTW98/MindFlow.git" ? "" : "VSIX manifest does not reference the public MindFlow repository",
  packagedLicense === sourceLicense ? "" : "VSIX license does not match LICENSE.txt",
  packagedLicense.includes("13. Remote Network Interaction; Use with the GNU General Public License.") ? "" : "VSIX does not contain the complete GNU AGPL v3 text",
  /All rights reserved|proprietary|No permission is granted|UNLICENSED/iu.test(packagedLicense) ? "VSIX contains proprietary licensing terms" : "",
  packagedReadme.includes("AGPL-3.0-only") && packagedReadme.includes("https://github.com/WangTW98/MindFlow") ? "" : "VSIX README does not contain the AGPL source notice",
  extensionBundle.includes(options.version) ? "" : "Extension bundle does not embed the snapshot version",
  routerBundle.includes(options.version) ? "" : "MCP Router bundle does not embed the snapshot version"
].filter(Boolean);

if (failures.length) {
  throw new Error(`VSIX verification failed:\n${failures.join("\n")}`);
}

console.log(`Verified ${path.basename(options.vsix)} at version ${options.version} with AGPL-3.0-only.`);

function readOptions(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option?.startsWith("--") || !value) {
      throw new Error("Usage: node scripts/verify-vsix.mjs --vsix <file> --version <X.Y.Z>");
    }
    values.set(option, value);
  }
  const vsix = values.get("--vsix");
  const version = values.get("--version");
  if (!vsix || !version || !/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error("Usage: node scripts/verify-vsix.mjs --vsix <file> --version <X.Y.Z>");
  }
  return { vsix: path.resolve(vsix), version };
}

function readEntry(vsix, entry) {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-p", vsix, entry], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`Unable to read ${entry} from ${vsix}: ${stderr}`)));
  });
}
