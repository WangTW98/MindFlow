import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/core/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/core/canvasLayout";
import { createEmptyProductFlow } from "../src/core/emptyFlow";
import { createManualEdge, createManualNode, deriveFeatureGroups, removeManualEdge, removeManualNode, updateManualAppSurfacePosition, updateManualEdgeDetails, updateManualNodeDetails, updateManualNodePosition } from "../src/core/flowEditing";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview, updateProjectOverviewPosition } from "../src/core/projectOverview";
import { applyTaxonomyRequest } from "../src/core/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/core/taxonomyEditing";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/core/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/models/productFlow";
import { parseProductFlowText, serializeProductFlow } from "../src/models/productFlowCodec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/storage/flowRepository";
import { RecentFlowStore } from "../src/storage/recentFlows";
import { recordEdgeDetailsRevision } from "../src/webview/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, renderFlowWebviewHtml } from "../src/webview/flowWebviewHtml";
import { parseWebviewMessage } from "../src/webview/flowWebviewMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

test("Project overview endpoint can create a normal persisted edge", () => {
  const flow = createEmptyProductFlow();
  const target = createManualNode(flow, { title: "采购工作台" });

  const edge = createManualEdge(flow, {
    from: { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID },
    to: { kind: "node", nodeId: target.nodeId },
    trigger: "进入项目主流程",
    type: "navigate"
  });

  assert.equal(edge.fromNodeId, PROJECT_OVERVIEW_NODE_ID);
  assert.equal(edge.from?.kind, "projectOverview");
  assert.equal(edge.toNodeId, target.nodeId);
  assert.equal(validateProductFlow(flow).valid, true);
});

test("Project overview app-surface system links are not persisted", () => {
  const flow = createEmptyProductFlow();
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "运营后台。",
    domainIds: [],
    roleIds: []
  }];

  deleteAppSurface(flow, "app_admin");

  assert.equal(flow.appSurfaces?.length, 0);
  assert.equal(flow.edges.some((edge) => edge.from?.kind === "projectOverview" || edge.to?.kind === "projectOverview"), false);
  assert.equal(validateProductFlow(flow).valid, true);
});

test("Generated nodes without coordinates receive a structural canvas layout", () => {
  const flow = createEmptyProductFlow();
  const start = createManualNode(flow, { title: "开始页" });
  const review = createManualNode(flow, { title: "审核页" });
  const done = createManualNode(flow, { title: "完成页" });

  createManualEdge(flow, { from: { kind: "node", nodeId: start.nodeId }, to: { kind: "node", nodeId: review.nodeId } });
  createManualEdge(flow, { from: { kind: "node", nodeId: review.nodeId }, to: { kind: "node", nodeId: done.nodeId } });
  const revisionBeforeLayout = flow.revision;

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
  assert.equal(flow.revision, revisionBeforeLayout + 1);

  const validation = validateProductFlow(flow);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Manual position changes bump revision consistently", () => {
  const flow = createProcurementFlow();
  const node = requireNodeByTitle(flow, "采购工作台");
  const surface = flow.appSurfaces?.[0];
  assert.ok(surface);

  const beforeNodeMove = flow.revision;
  updateManualNodePosition(flow, node.nodeId, 128.8, 256.2);
  assert.equal(flow.revision, beforeNodeMove + 1);
  assert.deepEqual(node.view?.position, { x: 129, y: 256 });

  const beforeSurfaceMove = flow.revision;
  updateManualAppSurfacePosition(flow, surface.appId, -420.4, 160.6);
  assert.equal(flow.revision, beforeSurfaceMove + 1);
  assert.deepEqual(surface.view?.position, { x: -420, y: 161 });
});

test("Manual position updates reject non-finite coordinates", () => {
  const flow = createEmptyProductFlow();
  const node = createManualNode(flow, { title: "坐标验证页" });
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台应用端。",
    domainIds: [],
    roleIds: []
  }];

  assertThrows(() => updateManualNodePosition(flow, node.nodeId, Number.NaN, 120), /finite numbers/);
  assertThrows(() => updateManualAppSurfacePosition(flow, "app_admin", 120, Number.POSITIVE_INFINITY), /finite numbers/);
  assertThrows(() => updateProjectOverviewPosition(flow, Number.NEGATIVE_INFINITY, 120), /finite numbers/);

  const fallback = createManualNode(flow, { title: "部分坐标页", x: Number.NaN, y: 240 });
  assert.deepEqual(fallback.view?.position, { x: 80, y: 240 });
  assert.equal(validateProductFlow(flow).valid, true);
});

test("Project overview edits sanitize text and preserve required fallbacks", () => {
  const flow = createEmptyProductFlow();
  const revisionBeforeDetails = flow.revision;

  updateProjectOverview(flow, {
    title: "  ",
    summary: "  新摘要  ",
    goal: "  降低跨端协作成本  "
  });

  assert.equal(flow.title, "Untitled MindFlow");
  assert.equal(flow.projectOverview.summary, "新摘要");
  assert.equal(flow.projectOverview.goal, "降低跨端协作成本");
  assert.equal(flow.revision, revisionBeforeDetails + 1);

  const revisionBeforeEmptySummary = flow.revision;
  updateProjectOverview(flow, { summary: "  " });
  assert.equal(flow.projectOverview.summary, "新摘要");
  assert.equal(flow.revision, revisionBeforeEmptySummary + 1);

  const revisionBeforePosition = flow.revision;
  updateProjectOverviewPosition(flow, -10.2, 99.8);
  assert.deepEqual(flow.projectOverview.view?.position, { x: -10, y: 100 });
  assert.equal(flow.revision, revisionBeforePosition + 1);
  assert.equal(validateProductFlow(flow).valid, true);
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

test("ensureAppSurfaceEntryEdges repairs missing app-surface entry links", () => {
  const flow = createProcurementFlow({ includeAppSurfaceEntryEdges: false });
  assert.equal(flow.edges.some((edge) => edge.from?.kind === "appSurface"), false);
  const revisionBeforeRepair = flow.revision;

  const result = ensureAppSurfaceEntryEdges(flow);
  assert.equal(result.addedEdgeIds.length, 4);
  assert.equal(flow.revision, revisionBeforeRepair + 1);
  assertAppSurfaceEntryEdge(flow, "app_admin", "采购工作台");
  assertAppSurfaceEntryEdge(flow, "app_supplier_portal", "供应商门户首页");
  assertAppSurfaceEntryEdge(flow, "app_mobile_approval", "移动审批待办");
  assertAppSurfaceEntryEdge(flow, "app_public_site", "采购公告列表");
  assert.equal(validateProductFlow(flow).valid, true);
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

  updateManualEdgeDetails(flow, edge.edgeId, { type: "nestedRelation" });
  assert.equal(updated?.type, "nestedRelation");
});

test("Manual edge editing rejects unsupported edge types at runtime", () => {
  const flow = createEmptyProductFlow();
  const source = createManualNode(flow, { title: "来源页" });
  const target = createManualNode(flow, { title: "目标页" });
  const edgeCount = flow.edges.length;

  assertThrows(() => {
    createManualEdge(flow, {
      from: { kind: "node", nodeId: source.nodeId },
      toNodeId: target.nodeId,
      trigger: "非法连线类型",
      type: "teleport" as never
    });
  }, /Unsupported edge type/);
  assert.equal(flow.edges.length, edgeCount);

  const edge = createManualEdge(flow, {
    from: { kind: "node", nodeId: source.nodeId },
    toNodeId: target.nodeId,
    trigger: "合法连线类型",
    type: "interaction"
  });
  assertThrows(() => {
    updateManualEdgeDetails(flow, edge.edgeId, { type: "teleport" as never });
  }, /Unsupported edge type/);
  assert.equal(edge.type, "interaction");
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

test("Feature group normalization keeps malformed detail patches safe", () => {
  const flow = createEmptyProductFlow();
  const node = createManualNode(flow, { title: "功能归一化页" });

  updateManualNodeDetails(flow, node.nodeId, {
    featureGroups: [
      {
        groupId: "",
        name: "  ",
        type: "",
        description: 123 as never,
        items: [
          {
            itemId: "",
            name: "  ",
            type: "",
            description: undefined as never,
            dataBinding: 12 as never,
            required: "yes" as never
          }
        ],
        actions: [
          {
            actionId: "",
            label: "  ",
            type: "",
            targetNodeId: 7 as never,
            preconditions: [" 已登录 ", "", 9 as never],
            result: 8 as never
          }
        ]
      }
    ]
  });

  const group = node.featureGroups?.[0];
  const item = group?.items[0];
  const action = group?.actions?.[0];
  assert.ok(group?.groupId);
  assert.equal(group.name, "功能分组 1");
  assert.equal(group.type, "section");
  assert.equal(group.description, "");
  assert.ok(item?.itemId);
  assert.equal(item?.name, "功能项 1");
  assert.equal(item?.type, "text");
  assert.equal(item?.description, "");
  assert.equal(item?.dataBinding, undefined);
  assert.equal(item?.required, undefined);
  assert.ok(action?.actionId);
  assert.equal(action?.label, "操作 1");
  assert.equal(action?.type, "user");
  assert.deepEqual(action?.preconditions, ["已登录"]);
  assert.equal(validateProductFlow(flow).valid, true);
});

test("Legacy node elements still derive feature groups for endpoint compatibility", () => {
  const flow = createEmptyProductFlow();
  const node = createManualNode(flow, { title: "旧元素页" });
  delete node.featureGroups;
  node.elements = [
    {
      elementId: "element_primary",
      name: "主按钮",
      type: "button",
      description: "旧版页面元素按钮。",
      required: true
    }
  ];

  const groups = deriveFeatureGroups(node);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.name, "页面元素");
  assert.equal(groups[0]?.items[0]?.name, "主按钮");
  assert.equal(groups[0]?.items[0]?.required, true);
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
