import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";

const root = process.cwd();
const sharedSkills = path.join(root, "agent-assets/skills");
const skillNames = ["mindflow-product-analysis", "mindflow-task-orchestrator", "mindflow-from-documents", "mindflow-from-code", "mindflow-from-canvas", "mindflow-canvas-authoring"];

test("packaged Agent assets retain six canonical MindFlow skills and generated client mirrors", async () => {
  for (const name of skillNames) {
    const canonical = await fs.readFile(path.join(sharedSkills, name, "SKILL.md"), "utf8");
    assert.equal(canonical.includes("[TODO:"), false);
    for (const client of ["codex", "claude"]) {
      const mirrored = await fs.readFile(path.join(root, "integrations", client, "mindflow-product-mapper", "skills", name, "SKILL.md"), "utf8");
      assert.equal(mirrored, canonical);
    }
  }
  await assert.rejects(() => fs.access(path.join(root, "integrations/codex/mindflow-product-mapper/.codex-plugin/plugin.json")));
  await assert.rejects(() => fs.access(path.join(root, "integrations/claude/mindflow-product-mapper/.claude-plugin/plugin.json")));
  const vscodeIgnore = await fs.readFile(path.join(root, ".vscodeignore"), "utf8");
  assert.equal(vscodeIgnore.includes("agent-assets/**"), false);
});

