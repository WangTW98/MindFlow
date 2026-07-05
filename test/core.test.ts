import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import type { FlowChangePlan, FlowOperation } from "../src/models/flowChange";
import type { AppSurface, FeatureGroup, FlowEdge, PageAction, PageElement, PageNode, ProductFlow } from "../src/models/productFlow";
import { applyFlowChangePlan } from "../src/changes/flowChangeApplier";
import { revertLastChangeSet } from "../src/changes/revertChangeSet";
import { ensureAppSurfaceEntryEdges } from "../src/core/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/core/canvasLayout";
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
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/core/taxonomyEditing";
import { MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions } from "../src/core/untitledMindFlowDocument";
import { validateProductFlow } from "../src/models/productFlow";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/storage/flowRepository";
import { RecentFlowStore } from "../src/storage/recentFlows";
import { buildSyncReport } from "../src/sync/syncArtifacts";
import { nowIso } from "../src/utils/id";

test("real-provider fixture creates a valid ProductFlow with app-surface entry edges", () => {
  const flow = createProcurementFlow();
  const validation = validateProductFlow(flow);

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(flow.appSurfaces?.length, 4);
  assert.ok(flow.nodes.length >= 15);
  assert.ok(flow.edges.length >= 20);
  assert.ok(flow.productDesignIssues?.some((issue) => issue.severity === "critical"));
  assert.ok(flow.productDesignIssues?.some((issue) => issue.severity === "warning"));
  assert.ok(flow.productDesignIssues?.some((issue) => issue.severity === "optional"));
  assertAppSurfaceEntryEdge(flow, "app_admin", "采购工作台");
  assertAppSurfaceEntryEdge(flow, "app_supplier_portal", "供应商门户首页");
  assertAppSurfaceEntryEdge(flow, "app_mobile_approval", "移动审批待办");
  assertAppSurfaceEntryEdge(flow, "app_public_site", "采购公告列表");
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
  assert.equal(flow.statusGroups?.length, 0);
  assert.equal(flow.productDesignIssues?.length, 0);
});

test("Generated nodes without coordinates receive a structural canvas layout", () => {
  const flow = createEmptyProductFlow();
  const start = createManualNode(flow, { title: "开始页" });
  const review = createManualNode(flow, { title: "审核页" });
  const done = createManualNode(flow, { title: "完成页" });

  createManualEdge(flow, { from: { kind: "node", nodeId: start.nodeId }, to: { kind: "node", nodeId: review.nodeId } });
  createManualEdge(flow, { from: { kind: "node", nodeId: review.nodeId }, to: { kind: "node", nodeId: done.nodeId } });

  const result = ensureReasonableNodeLayout(flow);
  const startPosition = start.view?.position;
  const reviewPosition = review.view?.position;
  const donePosition = done.view?.position;

  assert.deepEqual(new Set(result.updatedNodeIds), new Set([start.nodeId, review.nodeId, done.nodeId]));
  assert.ok(startPosition);
  assert.ok(reviewPosition);
  assert.ok(donePosition);
  assert.ok(startPosition.x < reviewPosition.x);
  assert.ok(reviewPosition.x < donePosition.x);
  assert.ok(startPosition.x !== reviewPosition.x || startPosition.y !== reviewPosition.y);
  assert.ok(reviewPosition.x !== donePosition.x || reviewPosition.y !== donePosition.y);

  const validation = validateProductFlow(flow);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Canvas layout repair preserves explicit node positions", () => {
  const flow = createEmptyProductFlow();
  const fixed = createManualNode(flow, { title: "固定页", x: 640, y: 120 });
  const generated = createManualNode(flow, { title: "生成页" });

  const result = ensureReasonableNodeLayout(flow);

  assert.deepEqual(result.updatedNodeIds, [generated.nodeId]);
  assert.deepEqual(fixed.view?.position, { x: 640, y: 120 });
  assert.ok(generated.view?.position);
});

test("Manual node details can set and clear a status group", () => {
  const flow = createEmptyProductFlow();
  flow.statusGroups = [{ statusGroupId: "status_review", title: "评审中", color: "#33aa55" }];
  const node = createManualNode(flow, { title: "需求评审页" });

  updateManualNodeDetails(flow, node.nodeId, { statusGroupId: "status_review" });
  assert.equal(node.statusGroupId, "status_review");

  updateManualNodeDetails(flow, node.nodeId, { statusGroupId: "" });
  assert.equal(node.statusGroupId, undefined);

  const validation = validateProductFlow(flow);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Blank MindFlow opens as an untitled document without a target file path", () => {
  const flow = createEmptyProductFlow();
  const options = createUntitledMindFlowDocumentOptions(flow);
  const validation = validateProductFlow(JSON.parse(options.content) as unknown);

  assert.equal(options.language, MINDFLOW_LANGUAGE_ID);
  assert.equal("uri" in options, false);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("ensureAppSurfaceEntryEdges repairs missing app-surface entry links", () => {
  const flow = createProcurementFlow({ includeAppSurfaceEntryEdges: false });
  assert.equal(flow.edges.some((edge) => edge.from?.kind === "appSurface"), false);

  const result = ensureAppSurfaceEntryEdges(flow);
  assert.equal(result.addedEdgeIds.length, 4);
  assertAppSurfaceEntryEdge(flow, "app_admin", "采购工作台");
  assertAppSurfaceEntryEdge(flow, "app_supplier_portal", "供应商门户首页");
  assertAppSurfaceEntryEdge(flow, "app_mobile_approval", "移动审批待办");
  assertAppSurfaceEntryEdge(flow, "app_public_site", "采购公告列表");
  assert.equal(validateProductFlow(flow).valid, true);
});

test("FlowChangePlan inserts a business node between two existing nodes", () => {
  const flow = createProcurementFlow();
  const from = requireNodeByTitle(flow, "询价方案编辑页");
  const to = requireNodeByTitle(flow, "供应商门户首页");
  const newNode = createDetachedNode(flow, {
    title: "风险复核页",
    pageType: "workflow",
    purpose: "处理发布询价前的供应商风险复核。",
    appSurfaceIds: ["app_admin"],
    domainIds: ["domain_sourcing"],
    roleIds: ["role_buyer"]
  });
  const scratch = cloneFlow(flow);
  scratch.nodes.push(newNode);
  const edgeA = createManualEdge(scratch, {
    from: { kind: "node", nodeId: from.nodeId },
    toNodeId: newNode.nodeId,
    trigger: "进入风险复核",
    type: "navigate"
  });
  const edgeB = createManualEdge(scratch, {
    from: { kind: "node", nodeId: newNode.nodeId },
    toNodeId: to.nodeId,
    trigger: "完成风险复核",
    type: "submit"
  });
  const originalEdge = flow.edges.find((edge) => edge.fromNodeId === from.nodeId && edge.toNodeId === to.nodeId);
  assert.ok(originalEdge);
  const operations: FlowOperation[] = [
    operation("addNode", { nodeId: newNode.nodeId }, null, newNode, "插入风险复核节点", false),
    operation("removeEdge", { edgeId: originalEdge.edgeId }, originalEdge, null, "替换原直接路径", true),
    operation("addEdge", { edgeId: edgeA.edgeId }, null, edgeA, "连接风险复核入口", false),
    operation("addEdge", { edgeId: edgeB.edgeId }, null, edgeB, "连接风险复核出口", false)
  ];
  const plan = createPlan(flow, "在询价方案编辑页和供应商门户首页之间加入风险复核业务", "insertBusiness", operations, [from.nodeId, to.nodeId, newNode.nodeId], [originalEdge.edgeId, edgeA.edgeId, edgeB.edgeId]);
  const next = applyFlowChangePlan(flow, plan, { confirmedDestructive: true });

  assert.equal(next.revision, flow.revision + 1);
  assert.ok(next.nodes.some((node) => node.title === "风险复核页"));
  assert.equal(next.edges.find((edge) => edge.edgeId === originalEdge.edgeId)?.status, "removed");
});

test("FlowChangePlan adds a feature only to the selected node", () => {
  const flow = createProcurementFlow();
  const node = requireNodeByTitle(flow, "合同归档页");
  const beforeOtherVersions = new Map(flow.nodes.map((item) => [item.nodeId, item.version]));
  const element: PageElement = {
    elementId: "el_export_order",
    name: "导出订单按钮",
    type: "button",
    description: "导出归档订单。",
    required: false
  };
  const action: PageAction = {
    actionId: "act_export_order",
    label: "导出订单按钮",
    type: "user",
    result: "导出归档订单。"
  };
  const plan = createPlan(flow, "给合同归档页增加导出订单按钮功能", "addFeature", [
    operation("addElement", { nodeId: node.nodeId, elementId: element.elementId }, null, element, "新增导出订单按钮", false),
    operation("addAction", { nodeId: node.nodeId, actionId: action.actionId }, null, action, "按钮同步新增页面动作", false)
  ], [node.nodeId]);
  const next = applyFlowChangePlan(flow, plan);
  const changed = next.nodes.find((item) => item.nodeId === node.nodeId);

  assert.ok(changed?.elements.some((item) => item.name === "导出订单按钮"));
  for (const item of next.nodes) {
    if (item.nodeId !== node.nodeId) {
      assert.equal(item.version, beforeOtherVersions.get(item.nodeId));
    }
  }
});

test("Removing a feature marks linked artifacts stale and can be reverted", () => {
  const flow = createProcurementFlow();
  const node = requireNodeByTitle(flow, "合同归档页");
  node.artifacts.prdIds.push("prd_existing");
  flow.artifacts.prds.push({
    prdId: "prd_existing",
    scope: "node",
    nodeId: node.nodeId,
    path: "docs/prd/existing.md",
    status: "active",
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  const targetElement = node.elements.find((element) => element.name === "导出 PDF 按钮");
  assert.ok(targetElement);
  const targetAction = node.actions.find((action) => action.label === targetElement.name);
  const operations: FlowOperation[] = [
    operation("removeElement", { nodeId: node.nodeId, elementId: targetElement.elementId }, targetElement, null, "移除导出 PDF 按钮", true)
  ];
  if (targetAction) {
    operations.push(operation("removeAction", { nodeId: node.nodeId, actionId: targetAction.actionId }, targetAction, null, "同步移除导出动作", true));
  }
  const plan = createPlan(flow, "移除合同归档页里的导出 PDF 按钮功能", "removeFeature", operations, [node.nodeId]);
  const next = applyFlowChangePlan(flow, plan, { confirmedDestructive: true });

  assert.equal(next.artifacts.prds.find((ref) => ref.prdId === "prd_existing")?.status, "stale");

  const reverted = revertLastChangeSet(next);
  const revertedNode = reverted.nodes.find((item) => item.nodeId === node.nodeId);
  assert.ok(revertedNode?.elements.some((element) => element.name === "导出 PDF 按钮"));
});

test("Sync report catches missing artifact files", () => {
  const flow = createProcurementFlow();
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

test("Manual feature item outlet can connect to multiple target nodes", () => {
  const flow = createProcurementFlow();
  const compare = requireNodeByTitle(flow, "报价对比页");
  const approval = requireNodeByTitle(flow, "审批发起页");
  const plan = requireNodeByTitle(flow, "采购计划新建页");
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

test("Manual target node inlet can accept multiple source outlets", () => {
  const flow = createProcurementFlow();
  const inquiry = requireNodeByTitle(flow, "询价方案编辑页");
  const supplierHome = requireNodeByTitle(flow, "供应商门户首页");
  const compare = requireNodeByTitle(flow, "报价对比页");
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

test("Manual app surface card can be positioned and connected as a normal edge endpoint", () => {
  const flow = createProcurementFlow();
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

test("Deleting an app surface removes connected edge endpoints and keeps the flow valid", () => {
  const flow = createProcurementFlow();
  const surface = flow.appSurfaces?.find((item) => item.appId === "app_supplier_portal") ?? flow.appSurfaces?.[0];
  const [fromNode, toNode] = flow.nodes.filter((node) => node.status === "active");
  assert.ok(surface);
  assert.ok(fromNode);
  assert.ok(toNode);

  const connectedEdge = createManualEdge(flow, {
    from: { kind: "appSurface", nodeId: surface.appId, appId: surface.appId },
    to: { kind: "node", nodeId: toNode.nodeId },
    trigger: "从被删除应用端进入页面",
    type: "navigate"
  });
  const metadataOnlyEdge = createManualEdge(flow, {
    from: { kind: "node", nodeId: fromNode.nodeId },
    to: { kind: "node", nodeId: toNode.nodeId },
    trigger: "普通节点连线",
    type: "navigate"
  });
  metadataOnlyEdge.appSurfaceIds = [surface.appId];
  fromNode.appSurfaceIds = [...(fromNode.appSurfaceIds ?? []), surface.appId];

  const result = deleteAppSurface(flow, surface.appId);
  const validation = validateProductFlow(flow);

  assert.ok(result.removedEdgeIds.includes(connectedEdge.edgeId));
  assert.equal(flow.appSurfaces?.some((item) => item.appId === surface.appId), false);
  assert.equal(flow.nodes.some((node) => node.appSurfaceIds?.includes(surface.appId)), false);
  assert.equal(flow.edges.some((edge) => edge.edgeId === connectedEdge.edgeId), false);
  assert.ok(flow.edges.some((edge) => edge.edgeId === metadataOnlyEdge.edgeId));
  assert.equal(flow.edges.some((edge) => edge.appSurfaceIds?.includes(surface.appId)), false);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Pruning app surface references removes stale connected card edges before validation", () => {
  const flow = createProcurementFlow();
  const surface = flow.appSurfaces?.find((item) => item.appId === "app_admin") ?? flow.appSurfaces?.[0];
  const target = flow.nodes.find((node) => node.status === "active");
  assert.ok(surface);
  assert.ok(target);

  const connectedEdge = createManualEdge(flow, {
    from: { kind: "appSurface", nodeId: surface.appId, appId: surface.appId },
    to: { kind: "node", nodeId: target.nodeId },
    trigger: "从管理后台进入页面",
    type: "navigate"
  });
  flow.appSurfaces = (flow.appSurfaces ?? []).filter((item) => item.appId !== surface.appId);

  const invalid = validateProductFlow(flow);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes(`${connectedEdge.edgeId}`) || error.includes(surface.appId)));

  const result = pruneMissingAppSurfaceReferences(flow);
  const validation = validateProductFlow(flow);

  assert.ok(result.removedEdgeIds.includes(connectedEdge.edgeId));
  assert.equal(flow.edges.some((edge) => edge.edgeId === connectedEdge.edgeId), false);
  assert.equal(flow.edges.some((edge) => edge.from?.appId === surface.appId), false);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Manual edge details update endpoints and new edge category types", () => {
  const flow = createProcurementFlow();
  const inquiry = requireNodeByTitle(flow, "询价方案编辑页");
  const quote = requireNodeByTitle(flow, "报价填写页");
  const compare = requireNodeByTitle(flow, "报价对比页");
  const inquiryGroup = inquiry.featureGroups?.[0];
  const quoteGroup = quote.featureGroups?.[0];
  const quoteItem = quoteGroup?.items[0];
  assert.ok(inquiryGroup);
  assert.ok(quoteGroup);
  assert.ok(quoteItem);

  const defaultEdge = createManualEdge(flow, {
    from: { kind: "node", nodeId: inquiry.nodeId },
    toNodeId: quote.nodeId,
    trigger: "默认连线类型"
  });
  assert.equal(defaultEdge.type, "interaction");

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

  updateManualEdgeDetails(flow, edge.edgeId, { type: "statusChange" });
  assert.equal(updated?.type, "statusChange");
});

test("Manual node feature group edits preserve parent-child hierarchy and derived actions", () => {
  const flow = createProcurementFlow();
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

test("Manual node deletion removes the node and all connected edges", () => {
  const flow = createProcurementFlow();
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

test("Manual edge deletion removes only the selected edge", () => {
  const flow = createProcurementFlow();
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
    const flow = createProcurementFlow();
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

test("Extension manifest contributes standalone .mindflow editor and sidebar only", async () => {
  const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf8");
  const manifest = JSON.parse(raw) as {
    activationEvents?: string[];
    contributes?: {
      viewsContainers?: { activitybar?: Array<{ id?: string; icon?: string }> };
      views?: Record<string, Array<{ id?: string; type?: string }>>;
      languages?: Array<{ id?: string; extensions?: string[]; icon?: { light?: string; dark?: string } }>;
      customEditors?: Array<{ viewType?: string; selector?: Array<{ filenamePattern?: string }> }>;
      commands?: Array<{ command?: string }>;
      configuration?: { properties?: Record<string, { default?: string; enum?: string[] }> };
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

  assert.deepEqual(manifest.contributes?.commands?.map((item) => item.command), [
    "mindflow.newFlow",
    "mindflow.openFlow",
    "mindflow.validateFlowJson"
  ]);
  assert.deepEqual(Object.keys(manifest.contributes?.configuration?.properties ?? {}), ["mindflow.storage.flowDirectory"]);
  assert.equal(manifest.activationEvents?.some((event) => event.includes("mindflow.agent")), false);
});

function createProcurementFlow(options: { includeAppSurfaceEntryEdges?: boolean } = {}): ProductFlow {
  const flow = createEmptyProductFlow("多应用端采购协同平台需求示例");
  flow.sourceDocumentId = "samples/example-requirements.md";
  flow.sourceSummary = "多应用端采购协同平台产品流程。";
  flow.domains = [
    { domainId: "domain_plan", name: "采购计划", description: "需求池、计划新建、计划详情与附件材料。" },
    { domainId: "domain_sourcing", name: "询价比价", description: "询价方案、供应商邀请、报价对比和比价报告。" },
    { domainId: "domain_supplier", name: "供应商投标", description: "门户首页、报价填写、报价撤回和合同确认。" },
    { domainId: "domain_mobile_approval", name: "移动审批", description: "待办列表、审批详情、通过、退回和转交。" },
    { domainId: "domain_contract_archive", name: "合同归档", description: "合同生成、供应商确认、归档详情和履约节点。" },
    { domainId: "domain_public", name: "公开采购公告", description: "公告列表、公告详情和供应商注册。" },
    { domainId: "domain_admin", name: "系统管理", description: "供应商审核、角色权限和黑名单维护。" }
  ];
  flow.roles = [
    { roleId: "role_buyer", name: "采购专员", description: "创建采购计划、发布询价、对比报价、发起审批。", domainIds: ["domain_plan", "domain_sourcing"] },
    { roleId: "role_purchase_manager", name: "采购经理", description: "审批采购方案，查看预算和供应商风险。", domainIds: ["domain_mobile_approval", "domain_sourcing"] },
    { roleId: "role_finance", name: "财务审核员", description: "审核预算占用、付款条款和财务风险。", domainIds: ["domain_mobile_approval", "domain_contract_archive"] },
    { roleId: "role_general_manager", name: "总经理", description: "审批高金额采购。", domainIds: ["domain_mobile_approval"] },
    { roleId: "role_supplier_sales", name: "供应商销售", description: "查看询价、提交报价和撤回报价。", domainIds: ["domain_supplier"] },
    { roleId: "role_supplier_admin", name: "供应商管理员", description: "管理供应商资料、确认合同。", domainIds: ["domain_supplier", "domain_contract_archive"] },
    { roleId: "role_guest_supplier", name: "访客供应商", description: "浏览公开公告并提交注册。", domainIds: ["domain_public"] },
    { roleId: "role_system_admin", name: "系统管理员", description: "审核供应商注册、维护供应商黑名单和权限。", domainIds: ["domain_admin"] }
  ];
  flow.appSurfaces = [
    {
      appId: "app_admin",
      name: "管理后台",
      type: "admin",
      description: "采购专员、采购经理、财务和系统管理员使用的运营后台。",
      domainIds: ["domain_plan", "domain_sourcing", "domain_contract_archive", "domain_admin"],
      roleIds: ["role_buyer", "role_purchase_manager", "role_finance", "role_system_admin"]
    },
    {
      appId: "app_supplier_portal",
      name: "供应商门户",
      type: "web",
      description: "供应商查看询价、提交报价和确认合同的门户。",
      domainIds: ["domain_supplier", "domain_contract_archive"],
      roleIds: ["role_supplier_sales", "role_supplier_admin"]
    },
    {
      appId: "app_mobile_approval",
      name: "移动审批 App",
      type: "app",
      description: "审批人处理采购审批待办的移动应用。",
      domainIds: ["domain_mobile_approval"],
      roleIds: ["role_purchase_manager", "role_finance", "role_general_manager"]
    },
    {
      appId: "app_public_site",
      name: "公开采购网站",
      type: "web",
      description: "访客供应商浏览采购公告并提交注册的公开站点。",
      domainIds: ["domain_public"],
      roleIds: ["role_guest_supplier"]
    }
  ];

  const workbenchNode = addNode(flow, "采购工作台", "workspace", ["app_admin"], ["domain_plan", "domain_sourcing"], ["role_buyer"], "采购专员查看需求池、待处理计划、报价和审批状态。", [
    ["需求池列表", "table", "展示待采购需求。"],
    ["新建计划按钮", "button", "进入采购计划新建页。"],
    ["待处理任务", "list", "展示待发布询价和待发起审批事项。"]
  ]);
  const planNode = addNode(flow, "采购计划新建页", "form", ["app_admin"], ["domain_plan"], ["role_buyer"], "录入采购计划基础信息、预算和需求附件。", [
    ["计划编号", "input", "录入或自动生成采购计划编号。"],
    ["采购品类", "select", "选择采购品类。"],
    ["预算金额", "currency", "录入预算金额。"],
    ["提交计划按钮", "button", "提交并进入询价方案编辑。"]
  ]);
  const inquiryNode = addNode(flow, "询价方案编辑页", "form", ["app_admin"], ["domain_sourcing"], ["role_buyer"], "维护供应商筛选条件、询价明细并发布询价。", [
    ["供应商等级", "select", "筛选供应商等级。"],
    ["历史履约评分", "number", "筛选历史评分。"],
    ["发布询价按钮", "button", "发布询价并通知供应商门户。"]
  ]);
  const supplierHomeNode = addNode(flow, "供应商门户首页", "home", ["app_supplier_portal"], ["domain_supplier"], ["role_supplier_sales", "role_supplier_admin"], "供应商查看定向询价、报价状态和合同确认任务。", [
    ["询价任务列表", "table", "展示可报价询价。"],
    ["进入报价按钮", "button", "进入报价填写页。"]
  ]);
  const quoteNode = addNode(flow, "报价填写页", "form", ["app_supplier_portal"], ["domain_supplier"], ["role_supplier_sales"], "供应商填写报价金额、交付周期并上传报价材料。", [
    ["报价金额", "currency", "填写报价金额。"],
    ["资质文件", "upload", "上传资质材料。"],
    ["提交报价按钮", "button", "提交报价到管理后台。"]
  ]);
  const compareNode = addNode(flow, "报价对比页", "workspace", ["app_admin"], ["domain_sourcing"], ["role_buyer"], "采购专员筛选、对比供应商报价并生成比价报告。", [
    ["供应商名称", "input", "按供应商名称筛选。"],
    ["报价结果列表", "table", "展示供应商、报价、税率、交期、评分和风险标签。"],
    ["查询按钮", "button", "查询报价列表。"],
    ["生成比价报告按钮", "button", "生成比价报告。"]
  ]);
  const approvalStartNode = addNode(flow, "审批发起页", "form", ["app_admin"], ["domain_sourcing", "domain_mobile_approval"], ["role_buyer"], "采购专员确认推荐供应商和审批流后发起移动审批。", [
    ["推荐供应商", "select", "选择推荐中标供应商。"],
    ["审批流选择", "select", "选择采购经理、财务审核员和总经理。"],
    ["发起审批按钮", "button", "发送审批待办到移动审批 App。"]
  ]);
  const mobileTodoNode = addNode(flow, "移动审批待办", "list", ["app_mobile_approval"], ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"], "审批人查看采购审批待办列表。", [
    ["待办列表", "list", "展示待审批采购事项。"],
    ["查看详情按钮", "button", "进入审批详情页。"]
  ]);
  const mobileDetailNode = addNode(flow, "移动审批详情页", "task", ["app_mobile_approval"], ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"], "审批人查看采购摘要、报价对比、预算占用和风险提示并处理审批。", [
    ["采购摘要", "summary", "展示采购计划摘要。"],
    ["通过按钮", "button", "审批通过。"],
    ["退回按钮", "button", "退回修改。"],
    ["转交按钮", "button", "转交其他审批人。"]
  ]);
  const contractNode = addNode(flow, "合同生成页", "form", ["app_admin"], ["domain_contract_archive"], ["role_buyer", "role_finance"], "生成合同、编辑付款条款和发送供应商确认。", [
    ["合同编号", "input", "录入合同编号。"],
    ["付款方式", "select", "选择付款方式。"],
    ["发送供应商确认按钮", "button", "发送到供应商门户确认。"]
  ]);
  const supplierContractNode = addNode(flow, "合同确认页", "task", ["app_supplier_portal"], ["domain_supplier", "domain_contract_archive"], ["role_supplier_admin"], "供应商管理员查看合同条款并确认或申请修改。", [
    ["合同预览", "document", "展示合同内容。"],
    ["确认按钮", "button", "确认合同。"],
    ["申请修改按钮", "button", "申请修改合同条款。"]
  ]);
  const archiveNode = addNode(flow, "合同归档页", "detail", ["app_admin", "app_supplier_portal"], ["domain_contract_archive"], ["role_buyer", "role_finance", "role_supplier_admin"], "展示合同状态、签署文件、履约计划、付款节点和操作记录。", [
    ["状态时间线", "timeline", "展示合同流转记录。"],
    ["签署文件", "document", "查看最终合同文件。"],
    ["导出 PDF 按钮", "button", "导出归档文件。"]
  ]);
  const publicListNode = addNode(flow, "采购公告列表", "list", ["app_public_site"], ["domain_public"], ["role_guest_supplier"], "访客供应商筛选并查看公开采购公告。", [
    ["公告筛选表单", "form", "按品类、预算范围、截止时间筛选。"],
    ["查看公告按钮", "button", "进入公告详情。"]
  ]);
  const registerNode = addNode(flow, "供应商注册页", "form", ["app_public_site"], ["domain_public"], ["role_guest_supplier"], "潜在供应商提交企业信息、联系人和资质文件。", [
    ["企业名称", "input", "填写企业名称。"],
    ["资质文件", "upload", "上传资质文件。"],
    ["提交注册按钮", "button", "提交到管理后台审核。"]
  ]);
  const supplierReviewNode = addNode(flow, "供应商审核页", "workspace", ["app_admin"], ["domain_admin"], ["role_system_admin"], "系统管理员处理公开网站提交的供应商注册申请。", [
    ["注册申请列表", "table", "展示待审核供应商。"],
    ["通过按钮", "button", "审核通过。"],
    ["驳回按钮", "button", "驳回注册申请。"]
  ]);

  flow.nodes.forEach((node, index) => {
    node.view = {
      position: {
        x: 60 + (index % 5) * 360,
        y: 60 + Math.floor(index / 5) * 320
      }
    };
  });

  createManualEdge(flow, { from: { kind: "node", nodeId: workbenchNode.nodeId }, toNodeId: planNode.nodeId, trigger: "新建采购计划", type: "create" });
  createManualEdge(flow, { from: { kind: "node", nodeId: planNode.nodeId }, toNodeId: inquiryNode.nodeId, trigger: "提交采购计划", type: "submit" });
  createManualEdge(flow, { from: { kind: "node", nodeId: inquiryNode.nodeId }, toNodeId: supplierHomeNode.nodeId, trigger: "发布询价", type: "submit" });
  createManualEdge(flow, { from: { kind: "node", nodeId: supplierHomeNode.nodeId }, toNodeId: quoteNode.nodeId, trigger: "进入报价", type: "navigate" });
  createManualEdge(flow, { from: { kind: "node", nodeId: quoteNode.nodeId }, toNodeId: compareNode.nodeId, trigger: "提交报价", type: "submit" });
  createManualEdge(flow, { from: { kind: "node", nodeId: compareNode.nodeId }, toNodeId: approvalStartNode.nodeId, trigger: "生成比价报告", type: "create" });
  createManualEdge(flow, { from: { kind: "node", nodeId: compareNode.nodeId }, toNodeId: planNode.nodeId, trigger: "回看采购计划", type: "navigate" });
  createManualEdge(flow, { from: { kind: "node", nodeId: approvalStartNode.nodeId }, toNodeId: mobileTodoNode.nodeId, trigger: "发起审批", type: "submit" });
  createManualEdge(flow, { from: { kind: "node", nodeId: mobileTodoNode.nodeId }, toNodeId: mobileDetailNode.nodeId, trigger: "查看审批详情", type: "navigate" });
  createManualEdge(flow, { from: { kind: "node", nodeId: mobileDetailNode.nodeId }, toNodeId: contractNode.nodeId, trigger: "审批通过", type: "approve" });
  createManualEdge(flow, { from: { kind: "node", nodeId: mobileDetailNode.nodeId }, toNodeId: inquiryNode.nodeId, trigger: "退回修改", type: "reject" });
  createManualEdge(flow, { from: { kind: "node", nodeId: contractNode.nodeId }, toNodeId: supplierContractNode.nodeId, trigger: "发送供应商确认", type: "submit" });
  createManualEdge(flow, { from: { kind: "node", nodeId: supplierContractNode.nodeId }, toNodeId: archiveNode.nodeId, trigger: "供应商确认", type: "submit" });
  createManualEdge(flow, { from: { kind: "node", nodeId: publicListNode.nodeId }, toNodeId: registerNode.nodeId, trigger: "提交注册", type: "create" });
  createManualEdge(flow, { from: { kind: "node", nodeId: registerNode.nodeId }, toNodeId: supplierReviewNode.nodeId, trigger: "注册申请提交", type: "submit" });
  createManualEdge(flow, { from: { kind: "node", nodeId: supplierReviewNode.nodeId }, toNodeId: supplierHomeNode.nodeId, trigger: "审核通过开通门户", type: "approve" });

  if (options.includeAppSurfaceEntryEdges !== false) {
    ensureAppSurfaceEntryEdges(flow);
  }

  flow.productDesignIssues = [
    {
      issueId: "pdi_critical_quote_retract",
      severity: "critical",
      title: "报价撤回缺少闭环路径",
      description: "供应商门户描述了报价撤回场景，但当前流程缺少撤回后的状态回滚。",
      prompt: "补充报价撤回闭环。",
      relatedNodeIds: [supplierHomeNode.nodeId, quoteNode.nodeId, compareNode.nodeId]
    },
    {
      issueId: "pdi_warning_reject_todo",
      severity: "warning",
      title: "退回审批后的采购待办承接不清晰",
      description: "移动审批退回后缺少采购专员待办承接。",
      prompt: "补充采购专员退回待办。",
      relatedNodeIds: [mobileDetailNode.nodeId, inquiryNode.nodeId, compareNode.nodeId]
    },
    {
      issueId: "pdi_optional_supplier_progress",
      severity: "optional",
      title: "供应商注册后缺少进度反馈体验",
      description: "访客供应商提交注册后缺少进度查询。",
      prompt: "补充供应商注册进度反馈。",
      relatedNodeIds: [registerNode.nodeId, supplierReviewNode.nodeId, supplierHomeNode.nodeId]
    }
  ];

  return flow;
}

function addNode(
  flow: ProductFlow,
  title: string,
  pageType: string,
  appSurfaceIds: string[],
  domainIds: string[],
  roleIds: string[],
  purpose: string,
  items: Array<[string, string, string]>
): PageNode {
  return createManualNode(flow, {
    title,
    pageType,
    appSurfaceIds,
    domainIds,
    roleIds,
    purpose,
    featureGroups: featureGroups(title, items)
  });
}

function featureGroups(title: string, specs: Array<[string, string, string]>): FeatureGroup[] {
  const groupId = `group_${safeId(title)}`;
  return [
    {
      groupId,
      name: "页面功能",
      type: "section",
      description: "页面中的主要功能分组。",
      items: specs.map(([name, type, description], index) => ({
        itemId: `item_${safeId(title)}_${index}`,
        name,
        type,
        description,
        required: type !== "button"
      }))
    }
  ];
}

function safeId(value: string): string {
  return value.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

function requireNodeByTitle(flow: ProductFlow, title: string): PageNode {
  const node = flow.nodes.find((item) => item.title === title);
  assert.ok(node, `Missing node ${title}`);
  return node;
}

function assertAppSurfaceEntryEdge(flow: ProductFlow, appId: string, targetTitle: string): void {
  const target = requireNodeByTitle(flow, targetTitle);
  const edge = flow.edges.find((item) =>
    item.status === "active" &&
    item.from?.kind === "appSurface" &&
    (item.from.appId ?? item.from.nodeId) === appId &&
    item.toNodeId === target.nodeId
  );
  assert.ok(edge, `Missing app surface entry edge ${appId} -> ${targetTitle}`);
}

function createDetachedNode(flow: ProductFlow, input: Parameters<typeof createManualNode>[1]): PageNode {
  const scratch = cloneFlow(flow);
  return createManualNode(scratch, input);
}

function createPlan(
  flow: ProductFlow,
  instruction: string,
  intent: string,
  operations: FlowOperation[],
  affectedNodeIds: string[],
  affectedEdgeIds: string[] = []
): FlowChangePlan {
  return {
    changeSetId: `chg_test_${safeId(intent)}_${operations.length}`,
    flowId: flow.flowId,
    baseRevision: flow.revision,
    instruction,
    intent,
    requiresClarification: false,
    operations,
    affectedNodeIds,
    affectedEdgeIds,
    artifactImpact: [],
    openQuestions: [],
    confidence: 1
  };
}

function operation(
  type: FlowOperation["type"],
  target: FlowOperation["target"],
  before: FlowOperation["before"],
  after: FlowOperation["after"],
  reason: string,
  requiresConfirmation: boolean
): FlowOperation {
  return {
    opId: `op_${safeId(type)}_${safeId(reason)}`,
    type,
    target,
    before,
    after,
    reason,
    risk: requiresConfirmation ? "medium" : "low",
    requiresConfirmation
  };
}

function cloneFlow(flow: ProductFlow): ProductFlow {
  return JSON.parse(JSON.stringify(flow)) as ProductFlow;
}

class FakeMemento {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  public async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}
