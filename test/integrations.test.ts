import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

const root = process.cwd();
const sharedSkills = path.join(root, "integrations/shared/skills");
const codexPlugin = path.join(root, "integrations/codex/mindflow-product-mapper");
const claudePlugin = path.join(root, "integrations/claude/mindflow-product-mapper");
const skillNames = ["mindflow-task-orchestrator", "mindflow-canvas-authoring", "mindflow-from-documents", "mindflow-from-code"];

test("Codex and Claude plugins package the four canonical MindFlow skills", async () => {
  const codexManifest = JSON.parse(await fs.readFile(path.join(codexPlugin, ".codex-plugin/plugin.json"), "utf8")) as Record<string, unknown>;
  const codexMcp = JSON.parse(await fs.readFile(path.join(codexPlugin, ".mcp.json"), "utf8")) as { mcpServers: { mindflow: { args: string[] } } };
  const claudeMcp = JSON.parse(await fs.readFile(path.join(claudePlugin, ".mcp.json"), "utf8")) as { mcpServers: { mindflow: { args: string[] } } };
  assert.equal(codexManifest.skills, "./skills/");
  assert.deepEqual(codexMcp.mcpServers.mindflow.args, ["${PLUGIN_ROOT}/scripts/mindflow-mcp-bootstrap.js"]);
  assert.deepEqual(claudeMcp.mcpServers.mindflow.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/mindflow-mcp-bootstrap.js"]);
  assert.ok((await fs.readFile(path.join(claudePlugin, "agents/mindflow-product-mapper.md"), "utf8")).includes("feature-item"));
  for (const name of skillNames) {
    const canonical = await fs.readFile(path.join(sharedSkills, name, "SKILL.md"), "utf8");
    assert.equal(await fs.readFile(path.join(codexPlugin, "skills", name, "SKILL.md"), "utf8"), canonical);
    assert.equal(await fs.readFile(path.join(claudePlugin, "skills", name, "SKILL.md"), "utf8"), canonical);
    assert.equal(canonical.includes("[TODO:"), false);
  }
});

test("MindFlow task script creates, checkpoints, validates, and ignores recoverable task state", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-task-test-"));
  const script = path.join(sharedSkills, "mindflow-task-orchestrator/scripts/mindflow_task.py");
  try {
    const initialized = await run("python3", [script, "init", "--workspace", workspace, "--title", "Order Management", "--source-type", "code", "--source-root", "src"], root);
    const task = initialized.stdout.trim();
    await run("python3", [script, "validate", "--task", task], root);
    await assert.rejects(
      () => run("python3", [script, "checkpoint", "--task", task, "--phase", "generating", "--part", "batch-001", "--next-action", "apply batch"], root),
      /before at least one analysis partition exists/
    );
    await run("python3", [script, "checkpoint", "--task", task, "--phase", "analyzing", "--part", "part-001-orders", "--next-action", "analyze part-002"], root);
    await run("python3", [script, "validate", "--task", task], root);

    const main = await fs.readFile(path.join(task, "mindflow_task.md"), "utf8");
    const checkpoints = await fs.readFile(path.join(task, "state/checkpoints.md"), "utf8");
    const ignore = await fs.readFile(path.join(workspace, ".gitignore"), "utf8");
    assert.ok(main.includes('task_status: "analyzing"'));
    assert.ok(main.includes('next_action: "analyze part-002"'));
    assert.ok(checkpoints.includes("part-001-orders"));
    assert.ok(ignore.includes(".mindflow/tasks/"));
    for (const relative of ["source_inventory.md", "analysis_summary.md", "graph/graph_summary.md", "state/entity_index.md", "state/generation_state.md", "reports/final_validation.md"]) {
      assert.equal((await fs.stat(path.join(task, relative))).isFile(), true);
    }
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("plugin bootstrap discovers a matching live VS Code session without client configuration", async () => {
  const temporaryHome = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-bootstrap-home-"));
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-bootstrap-workspace-"));
  const received: unknown[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      assert.equal(request.headers.authorization, "Bearer test-token");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "mindflow-test" } } }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address.");
    const sessions = path.join(temporaryHome, ".mindflow/mcp/sessions");
    await fs.mkdir(sessions, { recursive: true });
    await fs.writeFile(path.join(sessions, "test.json"), JSON.stringify({
      endpoint: `http://127.0.0.1:${address.port}/mcp`, token: "test-token", pid: process.pid,
      workspaceRoots: [workspace], createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString()
    }));
    const bootstrap = path.join(codexPlugin, "scripts/mindflow-mcp-bootstrap.js");
    const result = await run(process.execPath, [bootstrap], workspace, {
      ...process.env,
      HOME: temporaryHome
    }, `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "mindflow-test" } } });
    assert.equal(received.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(temporaryHome, { recursive: true, force: true });
    await fs.rm(workspace, { recursive: true, force: true });
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
