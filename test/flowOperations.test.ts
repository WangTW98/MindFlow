import { strict as assert } from "node:assert";
import test from "node:test";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { applyFlowOperation, applyFlowOperations, repairFlowReferencesBeforeSave } from "../src/product-flow/application/operations";
import { createFlowNode } from "../src/product-flow/domain/editing/graph";
import { validateProductFlow } from "../src/product-flow/domain";

test("save repair adds an app entry only for its unique skeleton", () => {
  const flow = createEmptyProductFlow();
  flow.appSurfaces = [{ appId: "app_admin", name: "管理后台", type: "admin", description: "后台", domainIds: [], roleIds: [] }];
  const skeleton = createFlowNode(flow, { title: "后台骨架", pageType: "skeleton", appSurfaceIds: ["app_admin"] });

  repairFlowReferencesBeforeSave(flow);

  const entry = flow.edges.find((edge) => edge.from.kind === "appSurface");
  assert.equal(entry?.to.nodeId, skeleton.nodeId);
  assert.equal(entry?.type, "nestedRelation");
});

test("Flow operations edit root, taxonomy, nodes, app surfaces, and edges", () => {
  const flow = createEmptyProductFlow();

  const root = applyFlowOperation(flow, {
    type: "project.update",
    patch: { title: "运营平台", summary: "本地编辑器。", goal: "支持建模。" }
  });
  assert.equal(root.type, "project.update");
  if (root.type !== "project.update") {
    throw new Error("Expected project.update result.");
  }
  assert.deepEqual(root.selection, { selectedProjectOverview: true });
  applyFlowOperation(flow, { type: "project.move", x: -100.2, y: 48.6 });

  const domain = applyFlowOperation(flow, {
    type: "taxonomy.upsert",
    kind: "domain",
    id: "domain_ops",
    item: { name: "运营", description: "运营域。" }
  });
  assert.equal(domain.type, "taxonomy.upsert");
  if (domain.type !== "taxonomy.upsert") {
    throw new Error("Expected taxonomy.upsert result.");
  }
  assert.equal(domain.taxonomy.id, "domain_ops");
  applyFlowOperation(flow, {
    type: "taxonomy.upsert",
    kind: "role",
    id: "role_ops",
    item: { name: "运营", description: "运营角色。", domainIds: ["domain_ops"] }
  });
  applyFlowOperation(flow, {
    type: "taxonomy.upsert",
    kind: "appSurface",
    id: "app_admin",
    item: { name: "管理后台", type: "admin", description: "后台。", domainIds: ["domain_ops"], roleIds: ["role_ops"] }
  });
  applyFlowOperation(flow, {
    type: "taxonomy.upsert",
    kind: "statusGroup",
    id: "status_review",
    item: { title: "评审中", color: "#33aa55" }
  });
  applyFlowOperation(flow, { type: "appSurface.move", appId: "app_admin", x: -320.4, y: 120.5 });

  const created = applyFlowOperation(flow, {
    type: "node.create",
    input: {
      title: "工作台",
      pageType: "page",
      appSurfaceIds: ["app_admin"],
      domainIds: ["domain_ops"],
      roleIds: ["role_ops"],
      x: 12.4,
      y: 34.6
    },
    detailPatch: {
      statusGroupId: "status_review",
      permissions: ["role_ops"],
      inputs: ["查询条件"],
      outputs: ["列表"]
    }
  });
  assert.equal(created.type, "node.create");
  if (created.type !== "node.create") {
    throw new Error("Expected node.create result.");
  }
  assert.equal(created.node.title, "工作台");
  assert.deepEqual(created.selection.selectedNodeIds, [created.node.nodeId]);
  assert.equal(created.node.statusGroupId, "status_review");

  const moved = applyFlowOperation(flow, { type: "node.move", nodeId: created.node.nodeId, x: 100.2, y: 160.8 });
  assert.equal(moved.type, "node.move");
  if (moved.type !== "node.move") {
    throw new Error("Expected node.move result.");
  }
  assert.deepEqual(moved.node.view?.position, { x: 100, y: 161 });

  const edge = applyFlowOperation(flow, {
    type: "edge.upsert",
    input: {
      from: { kind: "projectOverview", nodeId: "projectOverview" },
      to: { kind: "node", nodeId: created.node.nodeId },
      trigger: "进入工作台",
      type: "interaction"
    }
  });
  assert.equal(edge.type, "edge.upsert");
  if (edge.type !== "edge.upsert") {
    throw new Error("Expected edge.upsert result.");
  }
  assert.equal(edge.mode, "created");
  assert.equal(edge.edge.type, "interaction");

  const duplicate = applyFlowOperation(flow, {
    type: "edge.upsert",
    input: {
      from: { kind: "projectOverview", nodeId: "projectOverview" },
      to: { kind: "node", nodeId: created.node.nodeId },
      trigger: "更新入口",
      type: "interaction"
    }
  });
  assert.equal(duplicate.type, "edge.upsert");
  if (duplicate.type !== "edge.upsert") {
    throw new Error("Expected edge.upsert duplicate result.");
  }
  assert.equal(duplicate.mode, "updatedExisting");
  assert.equal(flow.edges.filter((item) => item.status === "active").length, 1);

  assertThrows(
    () => applyFlowOperation(flow, {
      type: "edge.upsert",
      input: {
        from: { kind: "projectOverview", nodeId: "projectOverview" },
        to: { kind: "node", nodeId: created.node.nodeId },
        trigger: "冲突入口",
        type: "dataFlow"
      }
    }),
    /duplicate endpoints/
  );

  const validation = validateProductFlow(flow);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Flow operation batches support atomic rollback and dry-run", () => {
  const flow = createEmptyProductFlow();
  const created = applyFlowOperation(flow, { type: "node.create", input: { title: "原节点" } });
  assert.equal(created.type, "node.create");
  if (created.type !== "node.create") {
    throw new Error("Expected node.create result.");
  }
  const before = JSON.stringify(flow);

  assertThrows(
    () => applyFlowOperations(flow, [
      { type: "node.update", nodeId: created.node.nodeId, patch: { title: "不应写入" } },
      { type: "node.update", nodeId: "missing_node", patch: { title: "缺失节点" } }
    ], { atomic: true }),
    /Missing node/
  );
  assert.equal(JSON.stringify(flow), before);

  const dryRun = applyFlowOperations(flow, [
    { type: "node.create", input: { title: "预检节点" } }
  ], { atomic: true, dryRun: true });

  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.dryRun, true);
  assert.equal(flow.nodes.length, 1);
  assert.equal(dryRun.flow.nodes.length, 2);
});

test("Flow operation batches apply auto layout positions atomically", () => {
  const flow = createEmptyProductFlow();
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台。",
    domainIds: [],
    roleIds: []
  }];
  const created = applyFlowOperation(flow, { type: "node.create", input: { title: "工作台" } });
  assert.equal(created.type, "node.create");
  if (created.type !== "node.create") {
    throw new Error("Expected node.create result.");
  }

  const beforeFailure = JSON.stringify(flow);
  assertThrows(
    () => applyFlowOperations(flow, [
      { type: "node.move", nodeId: created.node.nodeId, x: 100.4, y: 200.6 },
      { type: "node.move", nodeId: "missing_node", x: 300, y: 400 }
    ], { atomic: true }),
    /Missing node/
  );
  assert.equal(JSON.stringify(flow), beforeFailure);

  const beforeApply = JSON.stringify(flow);
  const applied = applyFlowOperations(flow, [
    { type: "project.move", x: -10.2, y: 20.8 },
    { type: "appSurface.move", appId: "app_admin", x: 520.2, y: 160.7 },
    { type: "node.move", nodeId: created.node.nodeId, x: 1040.4, y: -20.6 }
  ], { atomic: true });

  assert.equal(applied.applied, true);
  assert.deepEqual(applied.flow.projectOverview.view?.position, { x: -10, y: 21 });
  assert.deepEqual(applied.flow.appSurfaces?.[0]?.view?.position, { x: 520, y: 161 });
  assert.deepEqual(applied.flow.nodes[0]?.view?.position, { x: 1040, y: -21 });
  assert.equal(JSON.stringify(flow), beforeApply);
});

function assertThrows(fn: () => void, pattern: RegExp): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.ok(pattern.test(message), `Expected ${pattern} to match ${message}`);
    return;
  }
  throw new Error(`Expected function to throw ${pattern}.`);
}
