import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

test("snapshot versioning updates manifest and lockfile only inside the requested workspace", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-snapshot-version-"));
  try {
    await fs.writeFile(path.join(temporaryRoot, "package.json"), JSON.stringify({
      name: "mindflow-canvas-editor",
      version: "0.1.0",
      license: "AGPL-3.0-only"
    }, null, 2));
    await fs.writeFile(path.join(temporaryRoot, "package-lock.json"), JSON.stringify({
      name: "mindflow-canvas-editor",
      version: "0.1.0",
      lockfileVersion: 3,
      packages: {
        "": {
          name: "mindflow-canvas-editor",
          version: "0.1.0",
          license: "AGPL-3.0-only"
        }
      }
    }, null, 2));

    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "prepare-snapshot-version.mjs"),
      "--root",
      temporaryRoot,
      "--run-number",
      "42"
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "0.1.42");

    const manifest = JSON.parse(await fs.readFile(path.join(temporaryRoot, "package.json"), "utf8"));
    const lock = JSON.parse(await fs.readFile(path.join(temporaryRoot, "package-lock.json"), "utf8"));
    assert.equal(manifest.version, "0.1.42");
    assert.equal(lock.version, "0.1.42");
    assert.equal(lock.packages[""].version, "0.1.42");
    assert.equal(manifest.license, "AGPL-3.0-only");
    assert.equal(lock.packages[""].license, "AGPL-3.0-only");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("snapshot versioning rejects source versions outside the X.Y.0 contract", async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-invalid-snapshot-version-"));
  try {
    await fs.writeFile(path.join(temporaryRoot, "package.json"), JSON.stringify({ version: "0.1.7" }));
    await fs.writeFile(path.join(temporaryRoot, "package-lock.json"), JSON.stringify({
      version: "0.1.7",
      packages: { "": { version: "0.1.7" } }
    }));
    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "scripts", "prepare-snapshot-version.mjs"),
      "--root",
      temporaryRoot,
      "--run-number",
      "42"
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must use X\.Y\.0/u);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CI gates one snapshot artifact and release promotes only successful main pushes", async () => {
  const [ci, release] = await Promise.all([
    fs.readFile(path.join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8"),
    fs.readFile(path.join(process.cwd(), ".github", "workflows", "release.yml"), "utf8")
  ]);

  assert.ok(ci.includes("actions/checkout@v7"));
  assert.ok(ci.includes("actions/setup-node@v7"));
  assert.ok(ci.includes("actions/upload-artifact@v7"));
  assert.ok(ci.includes("needs: [quality, coverage, extension-host, security]"));
  assert.ok(ci.includes("prepare-snapshot-version.mjs"));
  assert.ok(ci.includes("verify-vsix.mjs"));
  assert.ok(ci.includes("retention-days: 14"));

  assert.ok(release.includes("workflow_run:"));
  assert.ok(release.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.ok(release.includes("github.event.workflow_run.event == 'push'"));
  assert.ok(release.includes("github.event.workflow_run.head_branch == 'main'"));
  assert.ok(release.includes("actions: read"));
  assert.ok(release.includes("contents: write"));
  assert.ok(release.includes("actions/download-artifact@v8"));
  assert.ok(release.includes("github.event.workflow_run.head_sha"));
  assert.ok(release.includes("snapshot-v${version}-${expected_sha}"));
  assert.ok(release.includes("--prerelease"));
  assert.ok(release.includes("--latest=false"));
  assert.ok(release.includes("AGPL-3.0-only"));
  assert.equal(release.includes("actions/checkout@"), false);
});
