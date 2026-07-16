import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { assertAbsoluteLocalMindFlowPath } from "../src/shared/localMindFlowPath";

test("local MindFlow paths accept external absolute files and reject implicit workspace paths", () => {
  const external = path.join(os.tmpdir(), "outside-every-workspace", "example.MINDFLOW");
  assert.equal(assertAbsoluteLocalMindFlowPath(external), path.normalize(external));
  assert.throws(() => assertAbsoluteLocalMindFlowPath("relative/example.mindflow"), /absolute local path/);
  assert.throws(() => assertAbsoluteLocalMindFlowPath(path.join(os.tmpdir(), "example.json")), /\.mindflow extension/);
});
