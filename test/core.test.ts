import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { MockProvider } from "../src/agents/MockProvider";
import { applyFlowChangePlan } from "../src/changes/flowChangeApplier";
import { revertLastChangeSet } from "../src/changes/revertChangeSet";
import { createEmptyProductFlow } from "../src/core/emptyFlow";
import {
  createManualEdge,
  createManualNode,
  removeManualEdge,
  removeManualNode,
  updateManualAppSurfacePosition,
  updateManualEdgeDetails,
  updateManualNodeDetails
} from "../src/core/flowEditing";
import { validateProductFlow } from "../src/models/productFlow";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/storage/flowRepository";
import { RecentFlowStore } from "../src/storage/recentFlows";
import { buildSyncReport } from "../src/sync/syncArtifacts";
import { nowIso } from "../src/utils/id";

test("MockProvider analyzes a document into a valid ProductFlow", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "# 采购协同平台\n采购专员创建采购计划并发布询价。",
    sourceDocumentId: "example.md"
  });

  const validation = validateProductFlow(flow);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.ok(flow.nodes.length >= 5);
  assert.ok(flow.edges.length >= 5);
});

test("Empty ProductFlow starts as a valid blank canvas", () => {
  const flow = createEmptyProductFlow();
  const validation = validateProductFlow(flow);

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(flow.nodes.length, 0);
  assert.equal(flow.edges.length, 0);
  assert.equal(flow.domains.length, 0);
  assert.equal(flow.roles.length, 0);
  assert.equal(flow.appSurfaces?.length, 0);
});

test("FlowChangePlan inserts a business node between two existing nodes", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "合同流程",
    sourceDocumentId: "example.md"
  });
  const from = flow.nodes.find((node) => node.title === "询价方案编辑页");
  const to = flow.nodes.find((node) => node.title === "报价对比页");
  assert.ok(from);
  assert.ok(to);

  const plan = await provider.proposeFlowChanges({
    flow,
    instruction: "在询价方案编辑页和报价对比页之间加入风险复核业务"
  });
  const next = applyFlowChangePlan(flow, plan, { confirmedDestructive: true });

  assert.equal(next.revision, flow.revision + 1);
  assert.ok(next.nodes.some((node) => node.title.includes("风险复核")));
  assert.ok(next.nodes.some((node) => node.nodeId === from.nodeId));
  assert.ok(next.nodes.some((node) => node.nodeId === to.nodeId));
});

test("FlowChangePlan adds a feature only to the selected node", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "合同流程",
    sourceDocumentId: "example.md"
  });
  const node = flow.nodes.find((item) => item.title === "合同归档页");
  assert.ok(node);
  const beforeOtherVersions = new Map(flow.nodes.map((item) => [item.nodeId, item.version]));
  const plan = await provider.proposeFlowChanges({
    flow,
    instruction: "给合同归档页增加导出订单按钮功能",
    selectedNodeId: node.nodeId
  });
  const next = applyFlowChangePlan(flow, plan);
  const changed = next.nodes.find((item) => item.nodeId === node.nodeId);
  assert.ok(changed?.elements.some((element) => element.name.includes("导出")));
  for (const item of next.nodes) {
    if (item.nodeId !== node.nodeId) {
      assert.equal(item.version, beforeOtherVersions.get(item.nodeId));
    }
  }
});

test("Removing a feature marks linked artifacts stale and can be reverted", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "合同流程",
    sourceDocumentId: "example.md"
  });
  const node = flow.nodes.find((item) => item.title === "合同归档页");
  assert.ok(node);
  node.artifacts.prdIds.push("prd_existing");
  flow.artifacts.prds.push({
    prdId: "prd_existing",
    scope: "node",
    nodeId: node.nodeId,
    path: "docs/prd/mock.md",
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  const plan = await provider.proposeFlowChanges({
    flow,
    instruction: "移除合同归档页里的导出 PDF 按钮功能",
    selectedNodeId: node.nodeId
  });
  const next = applyFlowChangePlan(flow, plan, { confirmedDestructive: true });
  assert.equal(next.artifacts.prds.find((ref) => ref.prdId === "prd_existing")?.status, "stale");

  const reverted = revertLastChangeSet(next);
  const revertedNode = reverted.nodes.find((item) => item.nodeId === node.nodeId);
  assert.ok(revertedNode?.elements.some((element) => element.name === "导出 PDF 按钮"));
});

test("Sync report catches missing artifact files", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "合同流程",
    sourceDocumentId: "example.md"
  });
  flow.artifacts.prds.push({
    prdId: "prd_missing",
    scope: "node",
    nodeId: flow.nodes[0]?.nodeId,
    path: "docs/prd/missing.md",
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  const report = buildSyncReport(flow, [
    {
      kind: "prd",
      artifactId: "prd_missing",
      path: "docs/prd/missing.md",
      missing: true
    }
  ]);
  assert.ok(report.issues.some((issue) => issue.message.includes("missing")));
});

test("Manual feature item outlet can connect to multiple target nodes", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "采购流程",
    sourceDocumentId: "example.md"
  });
  const compare = flow.nodes.find((node) => node.title === "报价对比页");
  const approval = flow.nodes.find((node) => node.title === "审批发起页");
  const plan = flow.nodes.find((node) => node.title === "采购计划新建页");
  assert.ok(compare);
  assert.ok(approval);
  assert.ok(plan);
  const group = compare.featureGroups?.[0];
  const item = group?.items.find((candidate) => candidate.name.includes("生成比价报告"));
  assert.ok(group);
  assert.ok(item);

  const from = {
    kind: "featureItem" as const,
    nodeId: compare.nodeId,
    groupId: group.groupId,
    itemId: item.itemId
  };
  createManualEdge(flow, { from, toNodeId: approval.nodeId, trigger: "生成比价报告后审批", type: "submit" });
  createManualEdge(flow, { from, toNodeId: plan.nodeId, trigger: "生成比价报告后回看计划", type: "navigate" });

  const sameOutletEdges = flow.edges.filter((edge) =>
    edge.status === "active" &&
    edge.from?.kind === "featureItem" &&
    edge.from.nodeId === from.nodeId &&
    edge.from.groupId === from.groupId &&
    edge.from.itemId === from.itemId
  );
  assert.ok(sameOutletEdges.some((edge) => edge.toNodeId === approval.nodeId));
  assert.ok(sameOutletEdges.some((edge) => edge.toNodeId === plan.nodeId));
  assert.ok(sameOutletEdges.length >= 2);
});

test("Manual target node inlet can accept multiple source outlets", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "采购流程",
    sourceDocumentId: "example.md"
  });
  const inquiry = flow.nodes.find((node) => node.title === "询价方案编辑页");
  const supplierHome = flow.nodes.find((node) => node.title === "供应商门户首页");
  const compare = flow.nodes.find((node) => node.title === "报价对比页");
  assert.ok(inquiry);
  assert.ok(supplierHome);
  assert.ok(compare);

  const inquiryGroup = inquiry.featureGroups?.[0];
  const supplierGroup = supplierHome.featureGroups?.[0];
  assert.ok(inquiryGroup);
  assert.ok(supplierGroup);

  createManualEdge(flow, {
    from: { kind: "featureGroup", nodeId: inquiry.nodeId, groupId: inquiryGroup.groupId },
    toNodeId: compare.nodeId,
    trigger: "询价发布后进入报价对比",
    type: "navigate"
  });
  createManualEdge(flow, {
    from: { kind: "featureGroup", nodeId: supplierHome.nodeId, groupId: supplierGroup.groupId },
    toNodeId: compare.nodeId,
    trigger: "供应商报价汇总后进入报价对比",
    type: "navigate"
  });

  const incomingEdges = flow.edges.filter((edge) => edge.status === "active" && edge.toNodeId === compare.nodeId);
  assert.ok(incomingEdges.some((edge) => edge.from?.nodeId === inquiry.nodeId));
  assert.ok(incomingEdges.some((edge) => edge.from?.nodeId === supplierHome.nodeId));
  assert.ok(incomingEdges.length >= 2);
});

test("Manual app surface card can be positioned and connected as a normal edge endpoint", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "采购流程",
    sourceDocumentId: "example.md"
  });
  const surface = flow.appSurfaces?.find((item) => item.appId === "app_admin") ?? flow.appSurfaces?.[0];
  const target = flow.nodes.find((node) => node.status === "active");
  assert.ok(surface);
  assert.ok(target);

  updateManualAppSurfacePosition(flow, surface.appId, -420, 160);
  const edge = createManualEdge(flow, {
    from: { kind: "appSurface", nodeId: surface.appId, appId: surface.appId },
    to: { kind: "node", nodeId: target.nodeId },
    trigger: "从应用端进入页面",
    type: "navigate"
  });

  assert.equal(surface.view?.position?.x, -420);
  assert.equal(surface.view?.position?.y, 160);
  assert.equal(edge.fromNodeId, surface.appId);
  assert.equal(edge.toNodeId, target.nodeId);
  assert.equal(edge.from?.kind, "appSurface");
  assert.equal(edge.from?.appId, surface.appId);
  assert.ok(edge.appSurfaceIds?.includes(surface.appId));
  assert.equal(validateProductFlow(flow).valid, true);
});

test("Manual edge details update endpoints and new edge category types", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "采购流程",
    sourceDocumentId: "example.md"
  });
  const inquiry = flow.nodes.find((node) => node.title === "询价方案编辑页");
  const quote = flow.nodes.find((node) => node.title === "报价填写页");
  const compare = flow.nodes.find((node) => node.title === "报价对比页");
  assert.ok(inquiry);
  assert.ok(quote);
  assert.ok(compare);
  const inquiryGroup = inquiry.featureGroups?.[0];
  const quoteGroup = quote.featureGroups?.[0];
  const quoteItem = quoteGroup?.items[0];
  assert.ok(inquiryGroup);
  assert.ok(quoteGroup);
  assert.ok(quoteItem);

  const edge = createManualEdge(flow, {
    from: { kind: "node", nodeId: inquiry.nodeId },
    toNodeId: compare.nodeId,
    trigger: "编辑连线详情",
    type: "navigate"
  });

  updateManualEdgeDetails(flow, edge.edgeId, {
    from: { kind: "featureGroup", nodeId: inquiry.nodeId, groupId: inquiryGroup.groupId },
    to: { kind: "featureItem", nodeId: quote.nodeId, groupId: quoteGroup.groupId, itemId: quoteItem.itemId },
    trigger: "报价触发规则",
    type: "dataFlow",
    condition: "报价数据同步后可流转",
    appSurfaceIds: ["app_admin", "app_supplier_portal"],
    domainIds: ["domain_sourcing", "domain_supplier"],
    roleIds: ["role_buyer", "role_supplier_sales"]
  });

  const updated = flow.edges.find((candidate) => candidate.edgeId === edge.edgeId);
  assert.equal(updated?.fromNodeId, inquiry.nodeId);
  assert.equal(updated?.toNodeId, quote.nodeId);
  assert.equal(updated?.from?.kind, "featureGroup");
  assert.equal(updated?.from?.groupId, inquiryGroup.groupId);
  assert.equal(updated?.to?.kind, "featureItem");
  assert.equal(updated?.to?.itemId, quoteItem.itemId);
  assert.equal(updated?.trigger, "报价触发规则");
  assert.equal(updated?.action, "报价触发规则");
  assert.equal(updated?.type, "dataFlow");
  assert.equal(updated?.condition, "报价数据同步后可流转");
  assert.equal(updated?.appSurfaceIds?.join(","), "app_admin,app_supplier_portal");
});

test("Manual node feature group edits preserve parent-child hierarchy and derived actions", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "采购流程",
    sourceDocumentId: "example.md"
  });
  const node = createManualNode(flow, {
    title: "手动验证页",
    appSurfaceIds: ["app_admin"],
    domainIds: ["domain_sourcing"],
    roleIds: ["role_buyer"]
  });
  updateManualNodeDetails(flow, node.nodeId, {
    featureGroups: [
      {
        groupId: "group_filters",
        name: "筛选区",
        type: "form",
        description: "管理查询条件。",
        items: [
          {
            itemId: "item_supplier_name",
            name: "供应商名称",
            type: "input",
            description: "输入供应商名称。",
            required: false
          }
        ]
      },
      {
        groupId: "group_actions",
        name: "操作区",
        type: "actions",
        description: "管理页面操作。",
        items: [
          {
            itemId: "item_submit_button",
            name: "提交按钮",
            type: "button",
            description: "提交页面数据。",
            required: false
          }
        ]
      }
    ]
  });

  const updated = flow.nodes.find((candidate) => candidate.nodeId === node.nodeId);
  assert.equal(updated?.featureGroups?.length, 2);
  assert.equal(updated?.featureGroups?.[1]?.items[0]?.name, "提交按钮");
  assert.ok(updated?.elements.some((element) => element.name === "供应商名称"));
  assert.ok(updated?.actions.some((action) => action.label === "提交按钮"));
});

test("Manual node deletion removes the node and all connected edges", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "采购流程",
    sourceDocumentId: "example.md"
  });
  const source = createManualNode(flow, { title: "删除源页" });
  const target = createManualNode(flow, { title: "删除目标页" });
  const other = createManualNode(flow, { title: "保留目标页" });
  const edgeA = createManualEdge(flow, {
    from: { kind: "node", nodeId: source.nodeId },
    toNodeId: target.nodeId,
    trigger: "进入删除目标"
  });
  const edgeB = createManualEdge(flow, {
    from: { kind: "node", nodeId: target.nodeId },
    toNodeId: other.nodeId,
    trigger: "离开删除目标"
  });
  const edgeC = createManualEdge(flow, {
    from: { kind: "node", nodeId: source.nodeId },
    toNodeId: other.nodeId,
    trigger: "保留路径"
  });

  const result = removeManualNode(flow, target.nodeId);

  assert.equal(result.node.status, "removed");
  const removedEdgeIds = new Set(result.removedEdges.map((edge) => edge.edgeId));
  assert.equal(removedEdgeIds.size, 2);
  assert.ok(removedEdgeIds.has(edgeA.edgeId));
  assert.ok(removedEdgeIds.has(edgeB.edgeId));
  assert.equal(flow.edges.find((edge) => edge.edgeId === edgeA.edgeId)?.status, "removed");
  assert.equal(flow.edges.find((edge) => edge.edgeId === edgeB.edgeId)?.status, "removed");
  assert.equal(flow.edges.find((edge) => edge.edgeId === edgeC.edgeId)?.status, "active");
});

test("Manual edge deletion removes only the selected edge", async () => {
  const provider = new MockProvider();
  const flow = await provider.analyzeDocument({
    documentName: "example.md",
    documentText: "采购流程",
    sourceDocumentId: "example.md"
  });
  const source = createManualNode(flow, { title: "连线源页" });
  const targetA = createManualNode(flow, { title: "连线目标 A" });
  const targetB = createManualNode(flow, { title: "连线目标 B" });
  const edgeA = createManualEdge(flow, {
    from: { kind: "node", nodeId: source.nodeId },
    toNodeId: targetA.nodeId,
    trigger: "删除这条线"
  });
  const edgeB = createManualEdge(flow, {
    from: { kind: "node", nodeId: source.nodeId },
    toNodeId: targetB.nodeId,
    trigger: "保留这条线"
  });

  removeManualEdge(flow, edgeA.edgeId);

  assert.equal(flow.edges.find((edge) => edge.edgeId === edgeA.edgeId)?.status, "removed");
  assert.equal(flow.edges.find((edge) => edge.edgeId === edgeB.edgeId)?.status, "active");
});

test("FlowRepository saves and lists only .mindflow ProductFlow files", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-repo-"));
  try {
    const provider = new MockProvider();
    const flow = await provider.analyzeDocument({
      documentName: "example.md",
      documentText: "采购流程",
      sourceDocumentId: "example.md"
    });
    const repository = new FlowRepository(workspaceRoot);
    const savedPath = await repository.save(flow);
    assert.equal(path.extname(savedPath), FLOW_FILE_EXTENSION);

    const legacyPath = path.join(repository.directoryPath, "legacy-flow.json");
    await fs.writeFile(legacyPath, `${JSON.stringify(flow, null, 2)}\n`, "utf8");
    const listed = await repository.list();

    assert.ok(listed.includes(savedPath));
    assert.equal(listed.includes(legacyPath), false);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("RecentFlowStore clears and removes recent MindFlow records", async () => {
  const state = new FakeMemento();
  const store = new RecentFlowStore(state as unknown as vscode.Memento);
  const first = path.join(os.tmpdir(), "first.mindflow");
  const second = path.join(os.tmpdir(), "second.mindflow");

  await store.add(first, 100);
  await store.add(second, 200);
  await store.add(first, 300);

  assert.deepEqual(store.get()?.map((record) => record.absolutePath), [path.normalize(first), path.normalize(second)]);

  await store.remove(first);
  assert.deepEqual(store.get()?.map((record) => record.absolutePath), [path.normalize(second)]);

  await store.clear();
  assert.deepEqual(store.get(), []);
});

test("Extension manifest contributes MindFlow activity view and .mindflow custom editor only", async () => {
  const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf8");
  const manifest = JSON.parse(raw) as {
    activationEvents?: string[];
    contributes?: {
      viewsContainers?: { activitybar?: Array<{ id?: string; icon?: string }> };
      views?: Record<string, Array<{ id?: string; type?: string }>>;
      languages?: Array<{ id?: string; extensions?: string[]; icon?: { light?: string; dark?: string } }>;
      customEditors?: Array<{ viewType?: string; selector?: Array<{ filenamePattern?: string }> }>;
    };
  };

  assert.ok(manifest.contributes?.viewsContainers?.activitybar?.some((item) => item.id === "mindflow" && item.icon === "src/webview/media/icon.svg"));
  const sidebarView = manifest.contributes?.views?.mindflow?.find((item) => item.id === "mindflow.sidebar");
  assert.equal(sidebarView?.type, "webview");
  const language = manifest.contributes?.languages?.find((item) => item.id === "mindflow");
  assert.ok(language?.extensions?.includes(".mindflow"));
  assert.equal(language?.icon?.light, "src/webview/media/icon.svg");
  assert.equal(language?.icon?.dark, "src/webview/media/icon.svg");
  const editor = manifest.contributes?.customEditors?.find((item) => item.viewType === "mindflow.productFlow");
  assert.ok(editor);
  assert.ok(editor.selector?.some((item) => item.filenamePattern === "*.mindflow"));
  assert.equal(editor.selector?.some((item) => String(item.filenamePattern || "").endsWith(".json")), false);
  assert.ok(manifest.activationEvents?.includes("onCommand:mindflow.updateAppSurfacePosition"));
  assert.ok(manifest.activationEvents?.includes("onCommand:mindflow.newFlow"));
});

class FakeMemento {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}
