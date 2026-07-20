import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.dirname(path.dirname(scriptPath));

export function createSnapshotVersion(baseVersion, runNumberValue) {
  const match = /^(\d+)\.(\d+)\.0$/u.exec(String(baseVersion));
  if (!match) {
    throw new Error(`Snapshot source version must use X.Y.0, received ${baseVersion}.`);
  }
  if (!/^\d+$/u.test(String(runNumberValue))) {
    throw new Error(`GitHub run number must be a positive integer, received ${runNumberValue}.`);
  }
  const runNumber = Number(runNumberValue);
  if (!Number.isSafeInteger(runNumber) || runNumber < 1) {
    throw new Error(`GitHub run number must be a positive safe integer, received ${runNumberValue}.`);
  }
  return `${match[1]}.${match[2]}.${runNumber}`;
}

export async function prepareSnapshotVersion(root, runNumberValue) {
  const packagePath = path.join(root, "package.json");
  const lockPath = path.join(root, "package-lock.json");
  const [manifestText, lockText] = await Promise.all([
    fs.readFile(packagePath, "utf8"),
    fs.readFile(lockPath, "utf8")
  ]);
  const manifest = JSON.parse(manifestText);
  const lock = JSON.parse(lockText);
  const snapshotVersion = createSnapshotVersion(manifest.version, runNumberValue);

  if (lock.version !== manifest.version || lock.packages?.[""]?.version !== manifest.version) {
    throw new Error("package.json and package-lock.json versions must match before snapshot versioning.");
  }

  manifest.version = snapshotVersion;
  lock.version = snapshotVersion;
  lock.packages[""].version = snapshotVersion;
  await Promise.all([
    fs.writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8")
  ]);
  return snapshotVersion;
}

function readCliOptions(args) {
  let root = defaultRoot;
  let runNumber;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--root") {
      root = path.resolve(args[index + 1] || "");
      index += 1;
    } else if (option === "--run-number") {
      runNumber = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown option: ${option}`);
    }
  }
  if (!runNumber) {
    throw new Error("Usage: node scripts/prepare-snapshot-version.mjs --run-number <number> [--root <path>]");
  }
  return { root, runNumber };
}

if (path.resolve(process.argv[1] || "") === scriptPath) {
  const options = readCliOptions(process.argv.slice(2));
  console.log(await prepareSnapshotVersion(options.root, options.runNumber));
}
