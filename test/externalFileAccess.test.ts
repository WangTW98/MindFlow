import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { authorizeMcpFileOpen } from "../src/platform/vscode/documents/externalFileAccess";

test("MCP external file policy allows workspace files and gates real external targets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-external-policy-"));
  const workspace = path.join(root, "workspace");
  const external = path.join(root, "external.mindflow");
  const internal = path.join(workspace, "internal.mindflow");
  await fs.mkdir(workspace);
  await fs.writeFile(internal, "{}");
  await fs.writeFile(external, "{}");
  try {
    const realInternal = await fs.realpath(internal);
    const realExternal = await fs.realpath(external);
    let prompts = 0;
    assert.equal(await authorizeMcpFileOpen(internal, [workspace], "prompt", async () => { prompts += 1; return false; }), realInternal);
    assert.equal(prompts, 0);
    await assert.rejects(() => authorizeMcpFileOpen(external, [workspace], "workspaceOnly", async () => true), /restricted/);
    await assert.rejects(() => authorizeMcpFileOpen(external, [workspace], "prompt", async () => false), /declined/);
    assert.equal(await authorizeMcpFileOpen(external, [workspace], "prompt", async () => true), realExternal);

    const linked = path.join(workspace, "linked.mindflow");
    await fs.symlink(external, linked);
    await assert.rejects(() => authorizeMcpFileOpen(linked, [workspace], "workspaceOnly", async () => true), /restricted/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
