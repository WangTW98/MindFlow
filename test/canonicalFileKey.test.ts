import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { canonicalFileKey, canonicalLocalFilePath } from "../src/shared/canonicalFileKey";
import { enqueueFlowDocumentEdit } from "../src/platform/vscode/documents/flowEditQueue";

test("canonicalFileKey collapses path, file URI, and symlink aliases", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-file-key-"));
  try {
    const physicalPath = path.join(directory, "Physical.mindflow");
    const aliasPath = path.join(directory, "alias.mindflow");
    await fs.writeFile(physicalPath, "{}", "utf8");
    await fs.symlink(physicalPath, aliasPath);

    const expected = canonicalFileKey(physicalPath);
    assert.equal(canonicalFileKey(pathToFileURL(physicalPath).toString()), expected);
    assert.equal(canonicalFileKey(aliasPath), expected);
    assert.equal(canonicalLocalFilePath(aliasPath), canonicalLocalFilePath(physicalPath));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("canonicalFileKey collapses an existing case alias on case-insensitive volumes", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-case-key-"));
  try {
    const physicalPath = path.join(directory, "MixedCase.mindflow");
    const caseAlias = path.join(directory, "mixedcase.mindflow");
    await fs.writeFile(physicalPath, "{}", "utf8");
    if (!await fs.access(caseAlias).then(() => true, () => false)) {
      context.skip("The test volume is case-sensitive.");
      return;
    }
    assert.equal(canonicalFileKey(caseAlias), canonicalFileKey(physicalPath));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("flow edit queue serializes symlink aliases of one physical file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-edit-key-"));
  try {
    const physicalPath = path.join(directory, "Physical.mindflow");
    const aliasPath = path.join(directory, "alias.mindflow");
    await fs.writeFile(physicalPath, "{}", "utf8");
    await fs.symlink(physicalPath, aliasPath);
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = enqueueFlowDocumentEdit(physicalPath, async () => {
      order.push("first:start");
      await firstMayFinish;
      order.push("first:end");
    });
    const second = enqueueFlowDocumentEdit(pathToFileURL(aliasPath).toString(), async () => {
      order.push("second:start");
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, ["first:start", "first:end", "second:start"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
