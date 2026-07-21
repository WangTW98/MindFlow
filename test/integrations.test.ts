import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
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

test("MindFlow task script creates, checkpoints, validates, and ignores recoverable task state", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-task-test-"));
  const script = path.join(sharedSkills, "mindflow-task-orchestrator/scripts/mindflow_task.py");
  try {
    const initialized = await run("python3", [
      script, "init", "--workspace", workspace, "--title", "Order Management",
      "--source-type", "code", "--source-root", "src", "--mode", "code-to-canvas",
      "--output-target", "canvas"
    ], root);
    const task = initialized.stdout.trim();
    await run("python3", [script, "validate", "--task", task], root);
    await assert.rejects(
      () => run("python3", [script, "checkpoint", "--task", task, "--phase", "framework_generating", "--part", "batch-001", "--next-action", "apply batch"], root),
      /before at least one analysis partition exists/
    );
    await run("python3", [script, "checkpoint", "--task", task, "--phase", "framework_analyzing", "--part", "part-001-orders", "--next-action", "analyze part-002"], root);
    await run("python3", [script, "validate", "--task", task], root);

    const main = await fs.readFile(path.join(task, "mindflow_task.md"), "utf8");
    const checkpoints = await fs.readFile(path.join(task, "state/checkpoints.md"), "utf8");
    const ignore = await fs.readFile(path.join(workspace, ".gitignore"), "utf8");
    assert.ok(main.includes('task_status: "analyzing"'));
    assert.ok(main.includes("workflow_version: 3"));
    assert.ok(main.includes('next_action: "analyze part-002"'));
    assert.ok(main.includes('mode: "code-to-canvas"'));
    assert.ok(main.includes('output_target: "canvas"'));
    assert.ok(checkpoints.includes("part-001-orders"));
    assert.ok(ignore.includes(".mindflow/tasks/"));
    for (const relative of [
      "source_inventory.md", "requirement_ledger.md", "analysis_summary.md", "analysis_packet.json",
      "graph/graph_summary.md", "state/entity_index.md", "state/generation_state.md", "state/batch_plan.json",
      "reports/semantic_validation.md", "reports/final_validation.md",
      "prd/product-prd.md", "prd/page-index.json", "graph/framework.md", "state/page_generation.json"
    ]) {
      assert.equal((await fs.stat(path.join(task, relative))).isFile(), true);
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("Workflow-version 2 blocks framework design until the hierarchical PRD bundle is complete and exported", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-prd-workflow-test-"));
  const script = path.join(sharedSkills, "mindflow-task-orchestrator/scripts/mindflow_task.py");
  try {
    const initialized = await run("python3", [
      script, "init", "--workspace", workspace, "--title", "Health Product",
      "--source-type", "documents", "--source-root", "docs", "--mode", "documents-to-canvas",
      "--output-target", "canvas", "--workflow-version", "2"
    ], root);
    const task = initialized.stdout.trim();
    await fs.writeFile(path.join(task, "analysis/part-001-framework.md"), "# Framework\n\n- status: completed\n", "utf8");
    await fs.writeFile(path.join(task, "analysis_summary.md"), "# Analysis Summary\n\nsynthesis_status: completed\n", "utf8");
    await assert.rejects(
      () => run("python3", [script, "checkpoint", "--task", task, "--phase", "framework_designing", "--part", "framework", "--next-action", "design framework"], root),
      /hierarchical PRD bundle is incomplete/
    );
    await fs.writeFile(path.join(task, "prd/product-prd.md"), "# Product PRD: Health Product\n\n- status: completed\n- evidence_refs: [docs/prd.md#scope]\n", "utf8");
    await fs.writeFile(path.join(task, "prd/pages/001-home.md"), "# Page PRD: Home\n\n- semantic_key: page:web:home\n- status: completed\n- page_type: page\n- application: app:web\n- parent: app:web\n- product_prd_refs: [product-prd.md#registry]\n- evidence_refs: [docs/prd.md#home]\n", "utf8");
    const index = {
      schemaVersion: 1,
      status: "completed",
      productPrd: { path: "prd/product-prd.md", status: "completed", fingerprint: "" },
      export: { path: "", status: "pending", fingerprint: "" },
      applications: ["app:web"],
      pages: [{ order: 1, semanticKey: "page:web:home", title: "Home", pageType: "page", application: "app:web", parent: "app:web", prdPath: "prd/pages/001-home.md", status: "completed", evidenceRefs: ["docs/prd.md#home"] }]
    };
    await fs.writeFile(path.join(task, "prd/page-index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
    const output = path.join(workspace, "docs/mindflow/health-product");
    await run("python3", [script, "export-prd", "--task", task, "--output", output], root);
    await run("python3", [script, "checkpoint", "--task", task, "--phase", "framework_designing", "--part", "framework", "--next-action", "design framework"], root);
    assert.equal((await fs.readFile(path.join(output, "product-prd.md"), "utf8")).includes("Health Product"), true);
    assert.equal((await fs.stat(path.join(output, "pages/001-home.md"))).isFile(), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("MindFlow deliverable tasks require analysis synthesis but not canvas graph generation", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-deliverable-task-test-"));
  const script = path.join(sharedSkills, "mindflow-task-orchestrator/scripts/mindflow_task.py");
  try {
    const initialized = await run("python3", [
      script, "init", "--workspace", workspace, "--title", "Canvas PRD",
      "--source-type", "canvas", "--mode", "canvas-to-deliverable", "--output-target", "prd"
    ], root);
    const task = initialized.stdout.trim();
    await assert.rejects(
      () => run("python3", [script, "checkpoint", "--task", task, "--phase", "delivering", "--part", "prd", "--next-action", "write PRD"], root),
      /before at least one analysis partition exists/
    );
    await fs.writeFile(path.join(task, "analysis/part-001-canvas.md"), "# Canvas\n\nstatus: completed\n", "utf8");
    await fs.writeFile(path.join(task, "analysis_summary.md"), "# Analysis Summary\n\nsynthesis_status: completed\n", "utf8");
    await run("python3", [script, "checkpoint", "--task", task, "--phase", "delivering", "--part", "prd", "--next-action", "write PRD"], root);
    await run("python3", [script, "checkpoint", "--task", task, "--phase", "completed", "--part", "prd-complete", "--next-action", "deliver PRD"], root);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("Product-analysis packet validation preserves evidence and inference boundaries", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-analysis-packet-test-"));
  const validator = path.join(sharedSkills, "mindflow-product-analysis/scripts/validate_analysis_packet.py");
  const template = path.join(sharedSkills, "mindflow-product-analysis/assets/analysis-packet.template.json");
  try {
    const valid = JSON.parse(await fs.readFile(template, "utf8")) as Record<string, unknown>;
    valid.screens = [{
      semanticKey: "page:web:orders",
      name: "Order List",
      pageType: "page",
      application: "app:web",
      parent: "app:web",
      domainKeys: [],
      roleKeys: [],
      regionKeys: ["region:orders:list", "region:orders:actions"],
      origin: "explicit",
      confidence: "high",
      evidenceRefs: ["prd.md#orders"]
    }];
    valid.regions = [{
      semanticKey: "region:orders:list",
      screenKey: "page:web:orders",
      name: "Order data",
      kind: "table",
      layout: "table",
      order: 1,
      featureKeys: ["feature:orders:table"],
      origin: "explicit",
      confidence: "high",
      evidenceRefs: ["prd.md#orders-table"]
    }, {
      semanticKey: "region:orders:actions",
      screenKey: "page:web:orders",
      name: "Order actions",
      kind: "actions",
      layout: "row",
      order: 2,
      featureKeys: ["feature:orders:approve"],
      origin: "explicit",
      confidence: "high",
      evidenceRefs: ["prd.md#order-actions"]
    }];
    valid.features = [{
      semanticKey: "feature:orders:table",
      screenKey: "page:web:orders",
      regionKey: "region:orders:list",
      name: "Order table",
      uiType: "table",
      order: 1,
      contentSpec: ["Order number", "Applicant", "Status"],
      origin: "explicit",
      confidence: "high",
      evidenceRefs: ["prd.md#orders-table"]
    }, {
      semanticKey: "feature:orders:approve",
      screenKey: "page:web:orders",
      regionKey: "region:orders:actions",
      name: "Approve",
      uiType: "button",
      order: 1,
      contentSpec: ["Approve the selected order"],
      interaction: {
        event: "click",
        effect: "Mark the order approved",
        edgeType: "statusChange",
        targetSemanticKey: "page:web:orders"
      },
      origin: "explicit",
      confidence: "high",
      evidenceRefs: ["prd.md#approve-order"]
    }];
    valid.requirements = [{
      semanticKey: "requirement:approve-order",
      origin: "explicit",
      confidence: "high",
      evidenceRefs: ["prd.md#approval"]
    }, {
      semanticKey: "requirement:approval-notification",
      origin: "inferred",
      confidence: "medium",
      evidenceRefs: [],
      reason: "The documented approval transition has no stated user feedback."
    }];
    const validPath = path.join(directory, "valid.json");
    await fs.writeFile(validPath, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
    await run("python3", [validator, validPath], root);

    (valid.requirements as Array<Record<string, unknown>>)[1]!.reason = "";
    const invalidPath = path.join(directory, "invalid.json");
    await fs.writeFile(invalidPath, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
    await assert.rejects(() => run("python3", [validator, invalidPath], root), /inferred records require reason/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Product-analysis graph batches are dependency ordered and respect progressive limits", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-progressive-batches-test-"));
  const builder = path.join(sharedSkills, "mindflow-product-analysis/scripts/build_canvas_batches.py");
  try {
    const entities = [
      { entity: "edge", localRef: "edge-a-b", from: { kind: "node", nodeRef: "a" }, to: { kind: "node", nodeRef: "b" } },
      { entity: "node", localRef: "a", title: "A" },
      { entity: "root", title: "Product" },
      { entity: "appSurface", localRef: "web", name: "Web", type: "web" },
      { entity: "node", localRef: "b", title: "B" },
      { entity: "edge", localRef: "edge-b-a", from: { kind: "node", nodeRef: "b" }, to: { kind: "node", nodeRef: "a" } }
    ];
    const input = path.join(directory, "graph.json");
    const output = path.join(directory, "batches.json");
    await fs.writeFile(input, `${JSON.stringify({ entities }, null, 2)}\n`, "utf8");
    await run("python3", [builder, input, "--output", output, "--max-operations", "3", "--max-nodes", "1", "--max-edges", "1"], root);
    const plan = JSON.parse(await fs.readFile(output, "utf8")) as {
      schemaVersion: number;
      batches: Array<{ batchId: string; operations: Array<{ op: string }> }>;
    };
    assert.equal(plan.schemaVersion, 1);
    assert.ok(plan.batches.length >= 3);
    assert.deepEqual(plan.batches.map((batch) => batch.batchId), plan.batches.map((_, index) => `batch-${String(index + 1).padStart(3, "0")}`));
    for (const batch of plan.batches) {
      assert.ok(batch.operations.length <= 3);
      assert.ok(batch.operations.filter((operation) => operation.op === "node.upsert").length <= 1);
      assert.ok(batch.operations.filter((operation) => operation.op === "edge.upsert").length <= 1);
    }
    const operations = plan.batches.flatMap((batch) => batch.operations.map((operation) => operation.op));
    assert.ok(operations.indexOf("root.update") < operations.indexOf("taxonomy.upsert"));
    assert.ok(operations.indexOf("taxonomy.upsert") < operations.indexOf("node.upsert"));
    assert.ok(operations.lastIndexOf("node.upsert") < operations.indexOf("edge.upsert"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("MindFlow draft validator enforces five edge types, type reasons, and orange outlets", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-draft-test-"));
  const validator = path.join(sharedSkills, "mindflow-canvas-authoring/scripts/validate_mindflow_draft.py");
  try {
    const valid = path.join(directory, "valid.md");
    await fs.writeFile(valid, '# Valid\n\n```json\n{"entities":[{"entity":"node","localRef":"a","pageType":"page","statusGroupId":"review","featureGroups":[{"name":"状态操作","items":[{"name":"通过"}]}]},{"entity":"node","localRef":"b","pageType":"page","statusGroupId":"review","featureGroups":[{"name":"状态摘要","items":[{"name":"已通过"}]}]},{"entity":"edge","type":"nestedRelation","typeReason":"root entry","from":{"kind":"projectOverview"},"to":{"kind":"node","nodeRef":"a"}},{"entity":"edge","type":"statusChange","typeReason":"same review state group","from":{"kind":"featureItem","nodeRef":"a"},"to":{"kind":"node","nodeRef":"b"}}],"unresolved":[],"staleCandidates":[]}\n```\n');
    await run("python3", [validator, valid], root);

    const invalid = path.join(directory, "invalid.md");
    await fs.writeFile(invalid, '# Invalid\n\n```json\n{"entities":[{"entity":"edge","type":"nestedRelation","typeReason":"containment","from":{"kind":"node","nodeRef":"a"},"to":{"kind":"node","nodeRef":"b"},"cardOutletReason":"legacy"}],"unresolved":[],"staleCandidates":[]}\n```\n');
    await assert.rejects(() => run("python3", [validator, invalid], root), /featureItem or featureGroup outlet/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("MindFlow staged draft validation rejects stored root-to-app edges and framework placeholders at final", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-staged-draft-test-"));
  const validator = path.join(sharedSkills, "mindflow-canvas-authoring/scripts/validate_mindflow_draft.py");
  try {
    const framework = path.join(directory, "framework.md");
    await fs.writeFile(framework, '# Framework\n\n```json\n{"entities":[{"entity":"node","localRef":"home","semanticKey":"page:web:home","pageType":"page","featureGroups":[{"name":"框架定义","items":[{"name":"页面职责","description":"承载用户进入产品后的核心业务信息与操作入口。"}]}]}],"unresolved":[],"staleCandidates":[]}\n```\n', "utf8");
    await run("python3", [validator, "--stage", "framework", framework], root);
    await assert.rejects(() => run("python3", [validator, "--stage", "final", framework], root), /framework placeholder/);

    const duplicate = path.join(directory, "duplicate-root-app.md");
    await fs.writeFile(duplicate, '# Duplicate\n\n```json\n{"entities":[{"entity":"edge","type":"nestedRelation","typeReason":"membership","from":{"kind":"projectOverview"},"to":{"kind":"appSurface","appRef":"web"}}],"unresolved":[],"staleCandidates":[]}\n```\n', "utf8");
    await assert.rejects(() => run("python3", [validator, "--stage", "framework", duplicate], root), /rendered system line/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("MindFlow draft validator requires generic source-grounded overview and application copy", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-copy-test-"));
  const validator = path.join(sharedSkills, "mindflow-canvas-authoring/scripts/validate_mindflow_draft.py");
  try {
    const valid = path.join(directory, "valid-copy.md");
    await fs.writeFile(valid, `# Valid copy

\`\`\`json
{"entities":[{"entity":"root","summary":"该产品面向跨部门业务协作场景，将分散在不同渠道中的任务、资料、决策依据和处理记录汇集到统一工作空间。产品覆盖需求受理、任务处理、协作反馈、结果确认与历史追踪，并通过清晰的角色边界和数据权限保证不同参与者只访问职责范围内的信息。","goal":"建立从业务发起到结果确认的可追踪闭环，减少信息重复录入和上下文丢失，使关键操作、状态变化与交付结果可核验，并以文档中明确的响应效率和审计要求作为验收依据。"},{"entity":"appSurface","localRef":"workspace","name":"业务工作台","type":"web","description":"该工作台服务于负责受理和推进业务的内部人员，集中展示待处理任务、相关资料、协作反馈和处理历史。用户从统一入口进入核心流程，并按照所属角色访问可操作的数据范围；工作台负责流程推进与结果确认，不承担来源文档未定义的外部系统能力。"}],"unresolved":[],"staleCandidates":[]}
\`\`\`
`, "utf8");
    await run("python3", [validator, valid], root);

    const invalid = path.join(directory, "invalid-copy.md");
    await fs.writeFile(invalid, '# Invalid copy\n\n```json\n{"entities":[{"entity":"root","summary":"待分析","goal":"项目目标"},{"entity":"appSurface","description":"应用端独立入口"}],"unresolved":[],"staleCandidates":[]}\n```\n');
    await assert.rejects(() => run("python3", [validator, invalid], root), /source-grounded PRD-level copy/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

function run(command: string, args: string[], cwd: string, env = process.env, stdin?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed with ${code}: ${stderr}`));
    });
    child.stdin.end(stdin);
  });
}
