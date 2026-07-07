import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/domain/product-flow/editing/layout/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/domain/product-flow/editing/layout/canvasLayout";
import { createEmptyProductFlow } from "../src/domain/product-flow/model/factory";
import { createFlowEdge, createFlowNode, removeFlowEdge, removeFlowNode, updateFlowAppSurfacePosition, updateFlowEdgeDetails, updateFlowNodeDetails, updateFlowNodePosition } from "../src/domain/product-flow/editing/graph";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview } from "../src/domain/product-flow/editing/projectOverviewMutations";
import { applyTaxonomyRequest } from "../src/domain/product-flow/editing/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/domain/product-flow/editing/taxonomy/referenceCleanup";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/adapters/vscode/documents/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/domain/product-flow";
import { parseProductFlowText, serializeProductFlow } from "../src/domain/product-flow/serialization/codec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/infrastructure/persistence/flowRepository";
import { RecentFlowStore } from "../src/adapters/vscode/state/recentFlows";
import { dispatchFlowWebviewMessage } from "../src/adapters/vscode/editor/canvas/flowCommandDispatcher";
import { emptyFlowSelection, type FlowSelectionPatch, type FlowSelectionState } from "../src/domain/product-flow/selection";
import { recordEdgeDetailsRevision } from "../src/adapters/vscode/editor/canvas/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, createFlowWebviewHtml } from "../src/adapters/vscode/editor/canvas/webviewShellHtml";
import { parseWebviewMessage } from "../src/adapters/webview/protocol/flowWebviewMessages";
import { parseSidebarMessage } from "../src/adapters/webview/protocol/sidebarMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

test("FlowPanel webview HTML loads declared media resources in order", () => {
  const html = createFlowWebviewHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    styleUris: FLOW_WEBVIEW_STYLE_FILES.map((fileName) => `media/${fileName}`),
    scriptUris: FLOW_WEBVIEW_SCRIPT_FILES.map((fileName) => `media/${fileName}`),
    initialState: { flowPath: "sample.mindflow", dangerous: "<script>" }
  });

  let previousIndex = -1;
  for (const fileName of [...FLOW_WEBVIEW_STYLE_FILES, ...FLOW_WEBVIEW_SCRIPT_FILES]) {
    const index = html.indexOf(`media/${fileName}`);
    assert.ok(index > previousIndex, `${fileName} should appear after the previous media resource`);
    previousIndex = index;
  }
  assert.ok(html.includes("nonce=\"test-nonce\""));
  assert.ok(html.includes("\\u003cscript>"));
});

test("FlowPanel declared media resources exist on disk", async () => {
  for (const fileName of [...FLOW_WEBVIEW_STYLE_FILES, ...FLOW_WEBVIEW_SCRIPT_FILES]) {
    await fs.readFile(path.join(process.cwd(), "src", "adapters", "webview", "canvas", "media", fileName));
  }
});

test("FlowPanel webview uses one bundled script instead of legacy multi-script entrypoints", () => {
  assert.deepEqual([...FLOW_WEBVIEW_SCRIPT_FILES], ["dist/flowEditor.js"]);

  const html = createFlowWebviewHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    styleUris: FLOW_WEBVIEW_STYLE_FILES.map((fileName) => `media/${fileName}`),
    scriptUris: FLOW_WEBVIEW_SCRIPT_FILES.map((fileName) => `media/${fileName}`),
    initialState: { flowPath: "sample.mindflow" }
  });

  assert.ok(html.includes("media/dist/flowEditor.js"));
  assert.equal(html.includes("media/state/canvas-state.js"), false);
  assert.equal(html.includes("media/events/canvas-bindings.js"), false);
});

test("Sidebar webview loads stylesheet from sidebar media", async () => {
  const [viewSource, htmlSource] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "src", "adapters", "vscode", "sidebar", "SidebarView.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src", "adapters", "vscode", "sidebar", "sidebarHtml.ts"), "utf8")
  ]);

  assert.ok(viewSource.includes("\"src\", \"adapters\", \"webview\", \"sidebar\", \"media\""));
  assert.ok(htmlSource.includes("\"src\", \"adapters\", \"webview\", \"sidebar\", \"media\", \"sidebar.css\""));
  assert.equal(`${viewSource}\n${htmlSource}`.includes("\"src\", \"canvas\", \"media\""), false);
});

test("Webview endpoint codec falls back when encoded values are malformed", async () => {
  const { encodeEndpoint, endpointFromButton, parseEndpointValue } = await loadEndpointCodecHelpers();
  const fallback = { kind: "node", nodeId: "node_a" };
  const appSurfaceEndpoint = { kind: "appSurface", nodeId: "app_admin", appId: "app_admin" };

  assert.deepEqual(parseEndpointValue(encodeEndpoint(appSurfaceEndpoint), fallback), appSurfaceEndpoint);
  assert.deepEqual(endpointFromButton({ dataset: { originKind: "featureItem", originNodeId: "node_b", originGroupId: "group_a", originItemId: "item_a" } }), {
    kind: "featureItem",
    nodeId: "node_b",
    groupId: "group_a",
    itemId: "item_a"
  });
  assert.equal(endpointFromButton({ dataset: { originKind: "featureItem", originNodeId: "node_b", originGroupId: "group_a" } }), null);
  assert.deepEqual(parseEndpointValue("featureItem|node_b|group_a|item_a", fallback), {
    kind: "featureItem",
    nodeId: "node_b",
    groupId: "group_a",
    itemId: "item_a"
  });
  assert.deepEqual(parseEndpointValue("featureItem|node_b|group_a", fallback), fallback);
  assert.deepEqual(parseEndpointValue("unsupported|node_b||", fallback), fallback);
  assert.deepEqual(parseEndpointValue("%E0%A4%A", fallback), fallback);
  assert.deepEqual(parseEndpointValue("", undefined), { kind: "projectOverview", nodeId: "projectOverview" });
});

test("Selection relation panel resolves feature endpoints to owning node cards", async () => {
  const { getSelectionRelationGroups } = await loadSelectionRelationHelpers();
  const flow = createEmptyProductFlow("关系列表功能项端点测试");
  const source = createFlowNode(flow, {
    title: "来源节点卡片",
    featureGroups: [{
      groupId: "group_actions",
      name: "操作区",
      type: "section",
      description: "主要操作。",
      items: [{ itemId: "item_submit", name: "提交按钮", type: "button", description: "提交。" }]
    }]
  });
  const target = createFlowNode(flow, { title: "目标节点卡片" });
  const edge = createFlowEdge(flow, {
    from: { kind: "featureItem", nodeId: source.nodeId, groupId: "group_actions", itemId: "item_submit" },
    to: { kind: "node", nodeId: target.nodeId },
    trigger: "提交",
    type: "interaction"
  });

  const groups = getSelectionRelationGroups(flow, null, edge);

  assert.deepEqual(groups?.from, [{ kind: "node", id: source.nodeId, title: "来源节点卡片" }]);
  assert.deepEqual(groups?.to, [{ kind: "node", id: target.nodeId, title: "目标节点卡片" }]);
});

test("Selection relation panel shows app surface card titles for entry edges", async () => {
  const { getSelectionRelationGroups } = await loadSelectionRelationHelpers();
  const flow = createEmptyProductFlow("关系列表应用端入口测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台。",
    domainIds: [],
    roleIds: []
  }];
  const target = createFlowNode(flow, { title: "后台工作台", appSurfaceIds: ["app_admin"] });
  const edge = createFlowEdge(flow, {
    from: { kind: "appSurface", nodeId: "app_admin", appId: "app_admin" },
    to: { kind: "node", nodeId: target.nodeId },
    trigger: "进入后台",
    type: "interaction"
  });

  const groups = getSelectionRelationGroups(flow, null, edge);

  assert.deepEqual(groups?.from, [{ kind: "appSurface", id: "app_admin", title: "管理后台" }]);
  assert.deepEqual(groups?.to, [{ kind: "node", id: target.nodeId, title: "后台工作台" }]);
});

test("Selection relation panel filters removed relations and deduplicates node cards", async () => {
  const { getSelectionRelationGroups } = await loadSelectionRelationHelpers();
  const flow = createEmptyProductFlow("关系列表单节点测试");
  const selected = createFlowNode(flow, { title: "当前节点" });
  const source = createFlowNode(flow, { title: "来源节点" });
  const duplicateSource = createFlowNode(flow, { title: "重复来源节点" });
  const target = createFlowNode(flow, { title: "目标节点" });
  const removedSource = createFlowNode(flow, { title: "已移除来源" });
  const removedTarget = createFlowNode(flow, { title: "已移除目标" });

  createFlowEdge(flow, { from: { kind: "node", nodeId: source.nodeId }, to: { kind: "node", nodeId: selected.nodeId }, trigger: "来源一", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: source.nodeId }, to: { kind: "node", nodeId: selected.nodeId }, trigger: "来源重复", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: duplicateSource.nodeId }, to: { kind: "node", nodeId: selected.nodeId }, trigger: "第二来源", type: "interaction" }).status = "removed";
  createFlowEdge(flow, { from: { kind: "node", nodeId: removedSource.nodeId }, to: { kind: "node", nodeId: selected.nodeId }, trigger: "已移除来源", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: selected.nodeId }, to: { kind: "node", nodeId: target.nodeId }, trigger: "目标一", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "featureGroup", nodeId: selected.nodeId, groupId: selected.featureGroups![0]!.groupId }, to: { kind: "node", nodeId: target.nodeId }, trigger: "目标重复", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: selected.nodeId }, to: { kind: "node", nodeId: removedTarget.nodeId }, trigger: "已移除目标", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: selected.nodeId }, to: { kind: "node", nodeId: duplicateSource.nodeId }, trigger: "已移除出边", type: "interaction" }).status = "removed";
  removedSource.status = "removed";
  removedTarget.status = "removed";

  const groups = getSelectionRelationGroups(flow, selected, null);

  assert.deepEqual(groups?.from, [{ kind: "node", id: source.nodeId, title: "来源节点" }]);
  assert.deepEqual(groups?.to, [{ kind: "node", id: target.nodeId, title: "目标节点" }]);
});

test("Canvas viewport fit brings saved offscreen content into view", async () => {
  const { canvasViewportFitForBounds } = await loadCanvasViewportHelpers();
  const bounds = { minX: 2000, minY: 1000, maxX: 2600, maxY: 1400 };
  const fit = canvasViewportFitForBounds(bounds, { width: 800, height: 600 }, 72);

  assert.ok(fit);
  assert.equal(fit.zoom <= 1, true);
  assert.ok(bounds.minX * fit.zoom + fit.camera.x >= 0);
  assert.ok(bounds.maxX * fit.zoom + fit.camera.x <= 800);
  assert.ok(bounds.minY * fit.zoom + fit.camera.y >= 0);
  assert.ok(bounds.maxY * fit.zoom + fit.camera.y <= 600);
});

test("Canvas viewport fit shrinks large content but does not enlarge small content", async () => {
  const { canvasViewportFitForBounds } = await loadCanvasViewportHelpers();
  const large = canvasViewportFitForBounds({ minX: 0, minY: 0, maxX: 2400, maxY: 1600 }, { width: 800, height: 600 }, 72);
  const small = canvasViewportFitForBounds({ minX: 20, minY: 40, maxX: 220, maxY: 180 }, { width: 1000, height: 800 }, 72);

  assert.ok(large);
  assert.ok(large.zoom < 1);
  assert.ok(small);
  assert.equal(small.zoom, 1);
});

test("Canvas viewport fit ignores empty bounds and unavailable canvas sizes", async () => {
  const { canvasViewportFitForBounds } = await loadCanvasViewportHelpers();

  assert.equal(canvasViewportFitForBounds(null, { width: 800, height: 600 }, 72), null);
  assert.equal(canvasViewportFitForBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 0, height: 600 }, 72), null);
});

test("Canvas auto layout previews hierarchy, lanes, spacing, and collision-free positions", async () => {
  const { autoLayoutComputePreview, autoLayoutEstimateLabelWidth } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("自动排版测试");
  flow.appSurfaces = [
    {
      appId: "app_admin",
      name: "管理后台",
      type: "admin",
      description: "后台",
      domainIds: [],
      roleIds: []
    },
    {
      appId: "app_supplier",
      name: "供应商端",
      type: "web",
      description: "供应商门户",
      domainIds: [],
      roleIds: []
    }
  ];
  const skeleton = createFlowNode(flow, { title: "后台骨架", pageType: "skeleton", appSurfaceIds: ["app_admin"] });
  const navigation = createFlowNode(flow, { title: "后台导航", pageType: "navigation", appSurfaceIds: ["app_admin"] });
  const pageA = createFlowNode(flow, { title: "采购列表", pageType: "page", appSurfaceIds: ["app_admin"] });
  const pageB = createFlowNode(flow, { title: "采购详情", pageType: "page", appSurfaceIds: ["app_admin"] });
  const popup = createFlowNode(flow, { title: "确认弹窗", pageType: "popup", appSurfaceIds: ["app_admin"] });
  const component = createFlowNode(flow, { title: "报价组件", pageType: "component", appSurfaceIds: ["app_supplier", "app_admin"] });
  const shared = createFlowNode(flow, { title: "共享未知节点", pageType: "unknown", appSurfaceIds: [] });
  const longTrigger = "这是一个非常长的连线标题用于验证自动排版会保留足够横向展示空间";
  createFlowEdge(flow, { from: { kind: "node", nodeId: skeleton.nodeId }, to: { kind: "node", nodeId: navigation.nodeId }, trigger: "进入导航", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: navigation.nodeId }, to: { kind: "node", nodeId: pageA.nodeId }, trigger: longTrigger, type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: pageA.nodeId }, to: { kind: "node", nodeId: popup.nodeId }, trigger: "打开确认", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: pageA.nodeId }, to: { kind: "node", nodeId: pageB.nodeId }, trigger: "查看详情", type: "interaction" });

  const layout = autoLayoutComputePreview(flow);

  assert.ok(layout.projectOverviewPosition.x < layout.appSurfacePositions.app_admin!.x);
  assert.ok(layout.appSurfacePositions.app_admin!.x < layout.nodePositions[skeleton.nodeId]!.x);
  assert.ok(layout.nodePositions[skeleton.nodeId]!.x < layout.nodePositions[navigation.nodeId]!.x);
  assert.ok(layout.nodePositions[navigation.nodeId]!.x < layout.nodePositions[pageA.nodeId]!.x);
  assert.ok(layout.nodePositions[pageA.nodeId]!.x < layout.nodePositions[popup.nodeId]!.x);
  assert.ok(layout.nodePositions[pageB.nodeId]!.x > layout.nodePositions[pageA.nodeId]!.x);
  assert.equal(layout.items.find((item) => item.id === popup.nodeId)?.layer, layout.items.find((item) => item.id === pageB.nodeId)?.layer);
  assert.equal(layout.nodePositions[component.nodeId]!.x, layout.nodePositions[skeleton.nodeId]!.x);
  assert.equal(layout.nodePositions[shared.nodeId]!.x, layout.nodePositions[skeleton.nodeId]!.x);
  assert.equal(layout.nodeLaneIds[component.nodeId], "app_supplier");
  assert.equal(layout.nodeLaneIds[shared.nodeId], "__shared");
  assert.ok(Math.abs(layout.appSurfacePositions.app_admin!.y - layout.appSurfacePositions.app_supplier!.y) >= 340);
  assert.ok(layout.columnGap >= 340 + autoLayoutEstimateLabelWidth(longTrigger) + 96);
  assertNoAutoLayoutOverlap(layout.items);
});

test("Canvas auto layout derives tree depth from same-type interaction edges", async () => {
  const { autoLayoutComputePreview } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("自动排版交互树层级测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台",
    domainIds: [],
    roleIds: []
  }];
  const start = createFlowNode(flow, { title: "A 起点", pageType: "page", appSurfaceIds: ["app_admin"] });
  const branch = createFlowNode(flow, { title: "B 分支", pageType: "page", appSurfaceIds: ["app_admin"] });
  const middle = createFlowNode(flow, { title: "C 中间", pageType: "page", appSurfaceIds: ["app_admin"] });
  const child = createFlowNode(flow, { title: "D 多父节点", pageType: "page", appSurfaceIds: ["app_admin"] });
  const final = createFlowNode(flow, { title: "E 末端", pageType: "page", appSurfaceIds: ["app_admin"] });
  createFlowEdge(flow, { from: { kind: "node", nodeId: start.nodeId }, to: { kind: "node", nodeId: middle.nodeId }, trigger: "进入中间", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: start.nodeId }, to: { kind: "node", nodeId: branch.nodeId }, trigger: "进入分支", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: middle.nodeId }, to: { kind: "node", nodeId: child.nodeId }, trigger: "继续", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: branch.nodeId }, to: { kind: "node", nodeId: child.nodeId }, trigger: "汇入", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: child.nodeId }, to: { kind: "node", nodeId: final.nodeId }, trigger: "完成", type: "interaction" });

  const layout = autoLayoutComputePreview(flow);
  const itemById = new Map(layout.items.map((item) => [item.id, item]));

  assert.ok(layout.nodePositions[start.nodeId]!.x < layout.nodePositions[middle.nodeId]!.x);
  assert.ok(layout.nodePositions[start.nodeId]!.x < layout.nodePositions[branch.nodeId]!.x);
  assert.ok(layout.nodePositions[middle.nodeId]!.x < layout.nodePositions[child.nodeId]!.x);
  assert.ok(layout.nodePositions[branch.nodeId]!.x < layout.nodePositions[child.nodeId]!.x);
  assert.ok(layout.nodePositions[child.nodeId]!.x < layout.nodePositions[final.nodeId]!.x);
  assert.equal(itemById.get(middle.nodeId)?.layer, itemById.get(start.nodeId)!.layer + 1);
  assert.equal(itemById.get(child.nodeId)?.layer, itemById.get(middle.nodeId)!.layer + 1);
  assert.equal(itemById.get(final.nodeId)?.layer, itemById.get(child.nodeId)!.layer + 1);
  assertNoAutoLayoutOverlap(layout.items);
});

test("Canvas auto layout handles cyclic same-lane flows with stable ordering", async () => {
  const { autoLayoutComputePreview } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("环形流程自动排版测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台",
    domainIds: [],
    roleIds: []
  }];
  const first = createFlowNode(flow, { title: "A 页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const second = createFlowNode(flow, { title: "B 页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const third = createFlowNode(flow, { title: "C 页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  createFlowEdge(flow, { from: { kind: "node", nodeId: first.nodeId }, to: { kind: "node", nodeId: second.nodeId }, trigger: "A 到 B", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: second.nodeId }, to: { kind: "node", nodeId: third.nodeId }, trigger: "B 到 C", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: third.nodeId }, to: { kind: "node", nodeId: first.nodeId }, trigger: "C 到 A", type: "interaction" });

  const layout = autoLayoutComputePreview(flow);

  assert.ok(layout.nodePositions[first.nodeId]!.x < layout.nodePositions[second.nodeId]!.x);
  assert.ok(layout.nodePositions[second.nodeId]!.x < layout.nodePositions[third.nodeId]!.x);
  assertNoAutoLayoutOverlap(layout.items);
});

test("Canvas auto layout splits crowded same-level nodes using measured card heights", async () => {
  const { autoLayoutComputePreview, autoLayoutEstimateLabelWidth } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("密集同级节点自动排版测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台",
    domainIds: [],
    roleIds: []
  }];
  const pages = Array.from({ length: 32 }, (_, index) => createFlowNode(flow, {
    title: `页面 ${index + 1}`,
    pageType: "page",
    appSurfaceIds: ["app_admin"]
  }));
  const popup = createFlowNode(flow, { title: "密集节点确认弹窗", pageType: "popup", appSurfaceIds: ["app_admin"] });
  const longTrigger = "这是一个非常长的跨层连线标题，用于验证分栏后的页面层不会挤入弹窗组件层";
  createFlowEdge(flow, {
    from: { kind: "node", nodeId: pages[0]!.nodeId },
    to: { kind: "node", nodeId: popup.nodeId },
    trigger: longTrigger,
    type: "interaction"
  });
  const measurements = {
    projectOverview: { width: 360, height: 300 },
    appSurfaces: {
      app_admin: { width: 320, height: 190 }
    },
    nodes: Object.fromEntries([
      ...pages.map((node) => [node.nodeId, { width: 320, height: 420 }]),
      [popup.nodeId, { width: 320, height: 360 }]
    ])
  };

  const layout = autoLayoutComputePreview(flow, measurements);
  const pageIds = new Set(pages.map((node) => node.nodeId));
  const pageItems = layout.items.filter((item) => item.kind === "node" && pageIds.has(item.id));
  const popupItem = layout.items.find((item) => item.id === popup.nodeId);
  assert.equal(pageItems.length, pages.length);
  assert.ok(popupItem);
  assert.ok(popupItem.layer > pageItems[0]!.layer);
  assertNoAutoLayoutOverlap(layout.items);
  assert.ok(Math.max(...pageItems.map((item) => item.x)) - Math.min(...pageItems.map((item) => item.x)) >= 320 + 160);
  const firstColumnItems = pageItems.filter((item) => item.x - Math.min(...pageItems.map((page) => page.x)) < 100).sort((left, right) => left.y - right.y);
  for (let index = 1; index < firstColumnItems.length; index += 1) {
    assert.ok(firstColumnItems[index]!.y - firstColumnItems[index - 1]!.y >= 420 + 110);
  }
  const pageRight = Math.max(...pageItems.map((item) => item.x + item.width));
  assert.ok(popupItem.x - pageRight >= autoLayoutEstimateLabelWidth(longTrigger) + 90);
});

test("Canvas auto layout preview state restores, invalidates, and updates dragged positions", async () => {
  const {
    autoLayoutComputePreview,
    autoLayoutCreatePreviewState,
    autoLayoutPreviewPositionsForFlow,
    autoLayoutPreviewStateWithPosition
  } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("自动排版预览状态测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台",
    domainIds: [],
    roleIds: []
  }];
  const page = createFlowNode(flow, { title: "页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const layout = autoLayoutComputePreview(flow);
  const previewState = autoLayoutCreatePreviewState(flow, layout);

  const restored = autoLayoutPreviewPositionsForFlow(flow, previewState);
  assert.deepEqual(restored?.nodePositions[page.nodeId], layout.nodePositions[page.nodeId]);

  const movedState = autoLayoutPreviewStateWithPosition(previewState, "node", page.nodeId, { x: 1234.4, y: 567.6 });
  const restoredAfterDrag = autoLayoutPreviewPositionsForFlow(flow, movedState);
  assert.deepEqual(restoredAfterDrag?.nodePositions[page.nodeId], { x: 1234, y: 568 });

  const unpositionedFlow = JSON.parse(JSON.stringify(flow));
  createFlowNode(unpositionedFlow, { title: "无坐标新增节点", pageType: "page", appSurfaceIds: ["app_admin"] });
  assert.equal(autoLayoutPreviewPositionsForFlow(unpositionedFlow, movedState), null);

  const positionedFlow = JSON.parse(JSON.stringify(flow));
  const positionedNode = createFlowNode(positionedFlow, { title: "拖拽新增节点", pageType: "page", appSurfaceIds: ["app_admin"], x: 880.2, y: 441.7 });
  createFlowEdge(positionedFlow, {
    from: { kind: "node", nodeId: page.nodeId },
    to: { kind: "node", nodeId: positionedNode.nodeId },
    trigger: "手动连接",
    type: "interaction"
  });
  const restoredWithPositionedNode = autoLayoutPreviewPositionsForFlow(positionedFlow, movedState);
  assert.deepEqual(restoredWithPositionedNode?.nodePositions[page.nodeId], { x: 1234, y: 568 });
  assert.deepEqual(restoredWithPositionedNode?.nodePositions[positionedNode.nodeId], { x: 880, y: 442 });
});

test("Canvas auto layout keeps preview state and recomputes order after edge endpoints change", async () => {
  const {
    autoLayoutComputePreview,
    autoLayoutCreatePreviewState,
    autoLayoutPreviewPositionsForFlow
  } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("自动排版连线调整测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台",
    domainIds: [],
    roleIds: []
  }];
  const first = createFlowNode(flow, { title: "A 页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const second = createFlowNode(flow, { title: "B 页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const edge = createFlowEdge(flow, {
    from: { kind: "node", nodeId: first.nodeId },
    to: { kind: "node", nodeId: second.nodeId },
    trigger: "A 到 B",
    type: "interaction"
  });
  const initialLayout = autoLayoutComputePreview(flow);
  const previewState = autoLayoutCreatePreviewState(flow, initialLayout);

  updateFlowEdgeDetails(flow, edge.edgeId, {
    from: { kind: "node", nodeId: second.nodeId },
    to: { kind: "node", nodeId: first.nodeId }
  });
  const restored = autoLayoutPreviewPositionsForFlow(flow, previewState);
  const layout = autoLayoutComputePreview(flow);

  assert.deepEqual(restored?.nodePositions[first.nodeId], initialLayout.nodePositions[first.nodeId]);
  assert.deepEqual(restored?.nodePositions[second.nodeId], initialLayout.nodePositions[second.nodeId]);
  assert.ok(layout.nodePositions[second.nodeId]!.x < layout.nodePositions[first.nodeId]!.x);
  assertNoAutoLayoutOverlap(layout.items);
});

test("Canvas auto layout breaks cycles by preserving higher-priority edge types", async () => {
  const { autoLayoutComputePreview } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("自动排版连线优先级测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台",
    domainIds: [],
    roleIds: []
  }];
  const first = createFlowNode(flow, { title: "A 页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const second = createFlowNode(flow, { title: "B 页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  createFlowEdge(flow, {
    from: { kind: "node", nodeId: first.nodeId },
    to: { kind: "node", nodeId: second.nodeId },
    trigger: "数据同步",
    type: "dataFlow"
  });
  createFlowEdge(flow, {
    from: { kind: "node", nodeId: second.nodeId },
    to: { kind: "node", nodeId: first.nodeId },
    trigger: "嵌套结构",
    type: "nestedRelation"
  });

  const layout = autoLayoutComputePreview(flow);

  assert.ok(layout.nodePositions[second.nodeId]!.x < layout.nodePositions[first.nodeId]!.x);
  assertNoAutoLayoutOverlap(layout.items);
});

test("Canvas auto layout aligns detail nodes to highest-priority incoming parent", async () => {
  const { autoLayoutComputePreview } = await loadAutoLayoutHelpers();
  const flow = createEmptyProductFlow("自动排版详情节点父级测试");
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台",
    domainIds: [],
    roleIds: []
  }];
  const dataParent = createFlowNode(flow, { title: "数据父页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const nestedParent = createFlowNode(flow, { title: "嵌套父页面", pageType: "page", appSurfaceIds: ["app_admin"] });
  const detail = createFlowNode(flow, { title: "确认弹窗", pageType: "popup", appSurfaceIds: ["app_admin"] });
  createFlowEdge(flow, {
    from: { kind: "node", nodeId: dataParent.nodeId },
    to: { kind: "node", nodeId: detail.nodeId },
    trigger: "数据同步",
    type: "dataFlow"
  });
  createFlowEdge(flow, {
    from: { kind: "node", nodeId: nestedParent.nodeId },
    to: { kind: "node", nodeId: detail.nodeId },
    trigger: "打开弹窗",
    type: "nestedRelation"
  });

  const layout = autoLayoutComputePreview(flow);

  assert.ok(layout.nodePositions[dataParent.nodeId]!.y !== layout.nodePositions[nestedParent.nodeId]!.y);
  assert.equal(layout.nodePositions[detail.nodeId]!.y, layout.nodePositions[nestedParent.nodeId]!.y);
  assert.ok(layout.nodePositions[nestedParent.nodeId]!.x < layout.nodePositions[detail.nodeId]!.x);
  assertNoAutoLayoutOverlap(layout.items);
});

test("Webview message parser rejects malformed messages before command dispatch", () => {
  assert.equal(parseWebviewMessage(null), undefined);
  assert.equal(parseWebviewMessage({ type: "saveNodePosition", nodeId: "node_a", x: Number.NaN, y: 20 }), undefined);
  assert.equal(parseWebviewMessage({ type: "saveProjectOverviewPosition", x: Number.POSITIVE_INFINITY, y: 20 }), undefined);
  assert.equal(parseWebviewMessage({
    type: "saveAutoLayoutPositions",
    projectOverviewPosition: { x: 0, y: 0 },
    appSurfacePositions: { app_admin: { x: Number.NaN, y: 160 } },
    nodePositions: {}
  }), undefined);
  assert.equal(parseWebviewMessage({
    type: "saveAutoLayoutPositions",
    projectOverviewPosition: { x: 0, y: 0 },
    appSurfacePositions: {},
    nodePositions: { node_a: { x: 320 } }
  }), undefined);
  assert.equal(parseWebviewMessage({
    type: "saveAutoLayoutPositions",
    projectOverviewPosition: { x: 0, y: 0 },
    appSurfacePositions: [],
    nodePositions: {}
  }), undefined);
  assert.equal(parseWebviewMessage({
    type: "createEdge",
    from: { kind: "node", nodeId: "node_a" },
    to: { kind: "featureItem", nodeId: "node_b", groupId: "group_a" }
  }), undefined);
  assert.equal(parseWebviewMessage({
    type: "createEdge",
    from: { kind: "node", nodeId: "node_a" },
    to: { kind: "node", nodeId: "node_b" },
    edgeType: "unsupported"
  }), undefined);
  assert.equal(parseWebviewMessage({ type: "updateTaxonomy", request: { kind: "domain", action: "delete" } }), undefined);

  assert.deepEqual(parseWebviewMessage({
    type: "createEdge",
    from: { kind: "appSurface", nodeId: "app_admin" },
    to: { kind: "node", nodeId: "node_b" },
    trigger: "进入",
    edgeType: "navigate"
  }), {
    type: "createEdge",
    from: { kind: "appSurface", nodeId: "app_admin", appId: "app_admin" },
    to: { kind: "node", nodeId: "node_b" },
    trigger: "进入",
    edgeType: "navigate"
  });
  assert.deepEqual(parseWebviewMessage({
    type: "saveAutoLayoutPositions",
    projectOverviewPosition: { x: -10.2, y: 20.8 },
    appSurfacePositions: { app_admin: { x: 120.4, y: 160.6 } },
    nodePositions: { node_a: { x: 520.1, y: -40.9 } }
  }), {
    type: "saveAutoLayoutPositions",
    projectOverviewPosition: { x: -10.2, y: 20.8 },
    appSurfacePositions: { app_admin: { x: 120.4, y: 160.6 } },
    nodePositions: { node_a: { x: 520.1, y: -40.9 } }
  });
});

test("Sidebar message parser rejects malformed messages before command dispatch", () => {
  assert.equal(parseSidebarMessage(null), undefined);
  assert.equal(parseSidebarMessage({ type: "openFlow" }), undefined);
  assert.equal(parseSidebarMessage({ type: "openFlow", flowPath: "" }), undefined);
  assert.equal(parseSidebarMessage({ type: "removeRecent", flowPath: 123 }), undefined);
  assert.equal(parseSidebarMessage({ type: "unknown" }), undefined);

  assert.deepEqual(parseSidebarMessage({ type: "newMindFlow" }), { type: "newMindFlow" });
  assert.deepEqual(parseSidebarMessage({ type: "openMindFlow" }), { type: "openMindFlow" });
  assert.deepEqual(parseSidebarMessage({ type: "clearRecent" }), { type: "clearRecent" });
  assert.deepEqual(parseSidebarMessage({ type: "openFlow", flowPath: "/tmp/example.mindflow" }), {
    type: "openFlow",
    flowPath: "/tmp/example.mindflow"
  });
  assert.deepEqual(parseSidebarMessage({ type: "removeRecent", flowPath: "/tmp/example.mindflow" }), {
    type: "removeRecent",
    flowPath: "/tmp/example.mindflow"
  });
});

test("Edge detail revisions ignore stale webview saves", () => {
  const revisions = new Map<string, number>();

  assert.equal(recordEdgeDetailsRevision(revisions, "edge_a", undefined), true);
  assert.equal(recordEdgeDetailsRevision(revisions, "edge_a", 2), true);
  assert.equal(recordEdgeDetailsRevision(revisions, "edge_a", 1), false);
  assert.equal(recordEdgeDetailsRevision(revisions, "edge_a", 2), true);
  assert.equal(recordEdgeDetailsRevision(revisions, "edge_a", 3), true);
  assert.equal(revisions.get("edge_a"), 3);
});

test("Flow webview command dispatcher maps selection and edit messages", async () => {
  const dispatcher = createDispatcherHarness();
  await dispatchFlowWebviewMessage({ type: "selectNode", nodeId: "node_a", selectedNodeIds: ["node_a", "node_b"] }, dispatcher.dispatcher);
  await dispatchFlowWebviewMessage({ type: "saveNodePosition", nodeId: "node_a", x: 12.2, y: 34.8 }, dispatcher.dispatcher);
  await dispatchFlowWebviewMessage({
    type: "saveAutoLayoutPositions",
    projectOverviewPosition: { x: 0, y: 10 },
    appSurfacePositions: { app_admin: { x: 520, y: 120 } },
    nodePositions: { node_a: { x: 1040, y: 240 }, node_b: { x: 1560, y: 360 } }
  }, dispatcher.dispatcher);
  await dispatchFlowWebviewMessage({
    type: "createEdge",
    from: { kind: "node", nodeId: "node_a" },
    to: { kind: "node", nodeId: "node_b" },
    trigger: "进入下一页",
    edgeType: "navigate"
  }, dispatcher.dispatcher);

  assert.deepEqual(dispatcher.selection, {
    ...emptyFlowSelection(),
    selectedProjectOverview: false,
    selectedNodeId: "node_a",
    selectedNodeIds: ["node_a", "node_b"]
  });
  assert.deepEqual(dispatcher.commands, [
    ["保存节点位置", "mindflow.updateNodePosition", "node_a", 12.2, 34.8, dispatcher.documentUri],
    [
      "应用自动排版",
      "mindflow.applyAutoLayoutPositions",
      { x: 0, y: 10 },
      { app_admin: { x: 520, y: 120 } },
      { node_a: { x: 1040, y: 240 }, node_b: { x: 1560, y: 360 } },
      dispatcher.documentUri
    ],
    [
      "创建连线",
      "mindflow.createEdge",
      { kind: "node", nodeId: "node_a" },
      { kind: "node", nodeId: "node_b" },
      "进入下一页",
      "navigate",
      dispatcher.documentUri
    ]
  ]);
});

test("Flow webview command dispatcher clears taxonomy selection before delete", async () => {
  const dispatcher = createDispatcherHarness({
    selectedAppSurfaceId: "app_admin",
    selectedDomainId: "domain_ops",
    selectedRoleId: "role_ops",
    selectedStatusGroupId: "status_review"
  });

  await dispatchFlowWebviewMessage({
    type: "updateTaxonomy",
    request: { kind: "domain", action: "delete", id: "domain_ops" }
  }, dispatcher.dispatcher);

  assert.equal(dispatcher.selection.selectedAppSurfaceId, "app_admin");
  assert.equal(dispatcher.selection.selectedDomainId, undefined);
  assert.equal(dispatcher.selection.selectedRoleId, "role_ops");
  assert.equal(dispatcher.selection.selectedStatusGroupId, "status_review");
  assert.deepEqual(dispatcher.commands, [
    ["更新元数据", "mindflow.updateTaxonomy", { kind: "domain", action: "delete", id: "domain_ops" }, dispatcher.documentUri]
  ]);
});

test("Flow webview command dispatcher ignores stale edge detail updates", async () => {
  const dispatcher = createDispatcherHarness();

  await dispatchFlowWebviewMessage({
    type: "updateEdgeDetails",
    edgeId: "edge_a",
    revision: 3,
    patch: {
      from: { kind: "node", nodeId: "node_a" },
      to: { kind: "node", nodeId: "node_b" }
    }
  }, dispatcher.dispatcher);
  await dispatchFlowWebviewMessage({
    type: "updateEdgeDetails",
    edgeId: "edge_a",
    revision: 2,
    patch: {
      from: { kind: "node", nodeId: "node_stale" },
      to: { kind: "node", nodeId: "node_b" }
    }
  }, dispatcher.dispatcher);

  assert.deepEqual(dispatcher.commands, [
    [
      "更新连线详情",
      "mindflow.updateEdgeDetails",
      "edge_a",
      {
        from: { kind: "node", nodeId: "node_a" },
        to: { kind: "node", nodeId: "node_b" }
      },
      dispatcher.documentUri
    ]
  ]);
});

function createDispatcherHarness(initialSelection: FlowSelectionPatch = emptyFlowSelection()) {
  const documentUri = "file:///workspace/sample.mindflow" as unknown as vscode.Uri;
  const commands: unknown[][] = [];
  let selection: FlowSelectionState = { ...emptyFlowSelection(), ...initialSelection };

  return {
    documentUri,
    commands,
    get selection() {
      return selection;
    },
    dispatcher: {
      documentUri,
      latestEdgeDetailsRevisions: new Map<string, number>(),
      selectionController: {
        getSelection: () => ({ ...selection }),
        setSelection: (_flowUri: vscode.Uri | string, patch: FlowSelectionPatch) => {
          selection = { ...emptyFlowSelection(), ...patch };
        }
      },
      executeCommand: async (label: string, command: string, ...args: unknown[]) => {
        commands.push([label, command, ...args]);
      }
    }
  };
}

interface EndpointCodecHelpers {
  encodeEndpoint(endpoint: Record<string, unknown>): string;
  endpointFromButton(button: { dataset: Record<string, string | undefined> }): unknown;
  parseEndpointValue(value: unknown, fallbackEndpoint?: Record<string, unknown>): unknown;
  endpointKey(endpoint: Record<string, unknown>): string;
}

interface SelectionRelationItem {
  kind: string;
  id: string;
  title: string;
}

interface SelectionRelationGroups {
  from: SelectionRelationItem[];
  to: SelectionRelationItem[];
}

interface SelectionRelationHelpers {
  getSelectionRelationGroups(flow: unknown, selectedNode: unknown, selectedEdge: unknown): SelectionRelationGroups | null;
}

interface CanvasViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CanvasViewportSize {
  width: number;
  height: number;
}

interface CanvasViewportFit {
  zoom: number;
  camera: {
    x: number;
    y: number;
  };
}

interface CanvasViewportHelpers {
  canvasViewportFitForBounds(bounds: CanvasViewportBounds | null, viewport: CanvasViewportSize, padding?: number): CanvasViewportFit | null;
}

interface AutoLayoutPosition {
  x: number;
  y: number;
}

interface AutoLayoutItem {
  id: string;
  kind: string;
  layer: number;
  laneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AutoLayoutResult {
  projectOverviewPosition: AutoLayoutPosition;
  appSurfacePositions: Record<string, AutoLayoutPosition>;
  nodePositions: Record<string, AutoLayoutPosition>;
  nodeLaneIds: Record<string, string>;
  items: AutoLayoutItem[];
  columnGap: number;
}

interface AutoLayoutHelpers {
  autoLayoutComputePreview(flow: unknown, measurements?: unknown): AutoLayoutResult;
  autoLayoutCreatePreviewState(flow: unknown, layout: AutoLayoutResult): unknown;
  autoLayoutPreviewPositionsForFlow(flow: unknown, previewState: unknown): AutoLayoutResult | null;
  autoLayoutPreviewStateWithPosition(previewState: unknown, kind: string, id: string, position: AutoLayoutPosition): unknown;
  autoLayoutEstimateLabelWidth(value: unknown): number;
}

async function loadEndpointCodecHelpers(): Promise<EndpointCodecHelpers> {
  const source = await fs.readFile(
    path.join(process.cwd(), "src", "adapters", "webview", "canvas", "runtime", "data", "canvas-endpoint-codec.js"),
    "utf8"
  );
  const factory = new Function(
    "PROJECT_OVERVIEW_NODE_ID",
    "getFeatureGroups",
    `${source}\nreturn { encodeEndpoint, endpointFromButton, parseEndpointValue, endpointKey };`
  ) as (projectOverviewNodeId: string, getFeatureGroups: (node: unknown) => unknown[]) => EndpointCodecHelpers;
  return factory("projectOverview", () => []);
}

async function loadSelectionRelationHelpers(): Promise<SelectionRelationHelpers> {
  const source = await fs.readFile(
    path.join(process.cwd(), "src", "adapters", "webview", "canvas", "runtime", "rendering", "canvas-selection-relations.js"),
    "utf8"
  );
  const factory = new Function(
    "PROJECT_OVERVIEW_NODE_ID",
    `${source}\nreturn { getSelectionRelationGroups };`
  ) as (projectOverviewNodeId: string) => SelectionRelationHelpers;
  return factory("projectOverview");
}

async function loadCanvasViewportHelpers(): Promise<CanvasViewportHelpers> {
  const source = await fs.readFile(
    path.join(process.cwd(), "src", "adapters", "webview", "canvas", "runtime", "interactions", "canvas-camera.js"),
    "utf8"
  );
  const factory = new Function(
    "MIN_ZOOM",
    "MAX_ZOOM",
    "clamp",
    `${source}\nreturn { canvasViewportFitForBounds };`
  ) as (minZoom: number, maxZoom: number, clamp: (value: number, min: number, max: number) => number) => CanvasViewportHelpers;
  return factory(0.05, 2.6, (value, min, max) => Math.min(max, Math.max(min, value)));
}

async function loadAutoLayoutHelpers(): Promise<AutoLayoutHelpers> {
  const source = await fs.readFile(
    path.join(process.cwd(), "src", "adapters", "webview", "canvas", "runtime", "layout", "canvas-auto-layout.js"),
    "utf8"
  );
  const factory = new Function(`${source}\nreturn { autoLayoutComputePreview, autoLayoutCreatePreviewState, autoLayoutPreviewPositionsForFlow, autoLayoutPreviewStateWithPosition, autoLayoutEstimateLabelWidth };`) as () => AutoLayoutHelpers;
  return factory();
}

function assertNoAutoLayoutOverlap(items: AutoLayoutItem[]): void {
  const margin = 44;
  for (let index = 0; index < items.length; index += 1) {
    const left = items[index];
    assert.ok(left);
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      const right = items[otherIndex];
      assert.ok(right);
      const overlaps = left.x - margin < right.x + right.width + margin &&
        left.x + left.width + margin > right.x - margin &&
        left.y - margin < right.y + right.height + margin &&
        left.y + left.height + margin > right.y - margin;
      assert.equal(overlaps, false, `${left.id} should not overlap ${right.id}`);
    }
  }
}
