import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "agent-assets", "skills");
const targets = [
  path.join(root, "integrations", "codex", "mindflow-product-mapper", "skills"),
  path.join(root, "integrations", "claude", "mindflow-product-mapper", "skills")
];
const check = process.argv.includes("--check");

for (const target of targets) {
  if (check) {
    const differences = await compareTrees(source, target);
    if (differences.length > 0) throw new Error(`Agent skill mirror differs at ${target}:\n${differences.join("\n")}`);
  } else {
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true });
  }
}
console.log(check ? "Agent skill mirrors are current." : "Agent skill mirrors synchronized.");

async function compareTrees(leftRoot, rightRoot) {
  const leftFiles = await listFiles(leftRoot);
  const rightFiles = await listFiles(rightRoot).catch(() => []);
  const differences = [];
  for (const relative of new Set([...leftFiles, ...rightFiles])) {
    if (!leftFiles.includes(relative)) differences.push(`extra: ${relative}`);
    else if (!rightFiles.includes(relative)) differences.push(`missing: ${relative}`);
    else if (!await sameFile(path.join(leftRoot, relative), path.join(rightRoot, relative))) differences.push(`changed: ${relative}`);
  }
  return differences;
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return (await listFiles(absolute)).map((nested) => path.join(entry.name, nested));
    return entry.isFile() ? [entry.name] : [];
  }));
  return files.flat().sort();
}

async function sameFile(left, right) {
  const [leftValue, rightValue] = await Promise.all([fs.readFile(left), fs.readFile(right)]);
  return leftValue.equals(rightValue);
}
