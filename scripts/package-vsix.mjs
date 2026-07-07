import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(".");
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const tempRoot = path.join("/tmp", `mindflow-vsix-${Date.now()}`);
const extensionRoot = path.join(tempRoot, "extension");
const outPath = path.join(root, `${pkg.name}-${pkg.version}.vsix`);
const outRoot = path.join(root, "out");
const tsc = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");

await fs.rm(outRoot, { recursive: true, force: true });
await run(process.execPath, ["scripts/build-webview.mjs"]);
await run(tsc, ["-p", "./"]);

await fs.rm(tempRoot, { recursive: true, force: true });
await fs.mkdir(extensionRoot, { recursive: true });

await copyFile("package.json", "extension/package.json");
await copyFile("README.md", "extension/readme.md");
await copyDir("src/state/schema", "extension/src/state/schema");
await copyDir("src/canvas/media", "extension/src/canvas/media");
await copyDir("out/src", "extension/out/src");

await fs.writeFile(path.join(tempRoot, "extension.vsixmanifest"), renderVsixManifest(pkg), "utf8");
await fs.writeFile(path.join(tempRoot, "[Content_Types].xml"), renderContentTypes(), "utf8");
await fs.rm(outPath, { force: true });
await zipDirectory(tempRoot, outPath);
await fs.rm(tempRoot, { recursive: true, force: true });

const stat = await fs.stat(outPath);
console.log(`Packaged ${path.relative(root, outPath)} (${stat.size} bytes)`);

async function copyFile(from, to) {
  const target = path.join(tempRoot, to);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(path.join(root, from), target);
}

async function copyDir(from, to) {
  await fs.cp(path.join(root, from), path.join(tempRoot, to), { recursive: true });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function zipDirectory(cwd, output) {
  return new Promise((resolve, reject) => {
    const child = spawn("zip", ["-qr", output, "."], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `zip exited with ${code}`));
      }
    });
  });
}

function renderVsixManifest(manifest) {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${escapeXml(manifest.name)}" Version="${escapeXml(manifest.version)}" Publisher="${escapeXml(manifest.publisher)}" />
    <DisplayName>${escapeXml(manifest.displayName)}</DisplayName>
    <Description xml:space="preserve">${escapeXml(manifest.description)}</Description>
    <Tags></Tags>
    <Categories>${escapeXml((manifest.categories || []).join(","))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${escapeXml(manifest.engines?.vscode || "*")}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.EnabledApiProposals" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExecutesCode" Value="true" />
      <Property Id="Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown" Value="true" />
      <Property Id="Microsoft.VisualStudio.Services.Content.Pricing" Value="Free"/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/readme.md" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

function renderContentTypes() {
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="mindflow" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="css" ContentType="text/css"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="xml" ContentType="text/xml"/>
  <Default Extension="txt" ContentType="text/plain"/>
</Types>
`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
