import { strict as assert } from "node:assert";
import * as path from "node:path";
import test from "node:test";
import { isPathInsideWorkspace, normalizeWorkspaceRelativeDirectory } from "../src/platform/vscode/documents/workspacePathPolicy";

test("workspace path policy accepts contained paths and rejects traversal", () => {
  const root = path.join(process.cwd(), "workspace-a");
  assert.equal(isPathInsideWorkspace(root, path.join(root, "flows", "test.mindflow")), true);
  assert.equal(isPathInsideWorkspace(root, path.join(root, "..", "outside.mindflow")), false);
  assert.equal(normalizeWorkspaceRelativeDirectory(".mindflow/flows"), path.normalize(".mindflow/flows"));
  assert.throws(() => normalizeWorkspaceRelativeDirectory("../../outside"), /cannot escape/);
  assert.throws(() => normalizeWorkspaceRelativeDirectory(path.join(root, "flows")), /workspace-relative/);
});
