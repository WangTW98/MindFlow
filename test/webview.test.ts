import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/product-flow/domain/editing/layout/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/product-flow/domain/editing/layout/canvasLayout";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { createFlowEdge, createFlowNode, removeFlowEdge, removeFlowNode, updateFlowAppSurfacePosition, updateFlowEdgeDetails, updateFlowNodeDetails, updateFlowNodePosition } from "../src/product-flow/domain/editing/graph";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview } from "../src/product-flow/domain/editing/projectOverviewMutations";
import { applyTaxonomyRequest } from "../src/product-flow/domain/editing/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/product-flow/domain/editing/taxonomy/referenceCleanup";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/platform/vscode/documents/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/product-flow/domain";
import { parseProductFlowText, serializeProductFlow } from "../src/product-flow/domain/serialization/codec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/product-flow/infrastructure/persistence/flowRepository";
import { RecentFlowStore } from "../src/platform/vscode/state/recentFlows";
import { dispatchFlowWebviewMessage } from "../src/platform/vscode/editor/canvas/flowCommandDispatcher";
import { emptyFlowSelection, type FlowSelectionPatch, type FlowSelectionState } from "../src/product-flow/domain/selection";
import { recordEdgeDetailsRevision } from "../src/platform/vscode/editor/canvas/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, createFlowWebviewHtml } from "../src/platform/vscode/editor/canvas/webviewShellHtml";
import { parseWebviewMessage } from "../src/platform/webview/protocol/flowWebviewMessages";
import {
  MINDFLOW_NODE_CLIPBOARD_KIND,
  MINDFLOW_NODE_CLIPBOARD_VERSION,
  parseMindFlowNodeClipboard,
  serializeMindFlowNodeClipboard,
  type MindFlowNodeClipboardPayload
} from "../src/platform/webview/protocol/nodeClipboard";
import { parseSidebarMessage } from "../src/platform/webview/protocol/sidebarMessages";
import {
  assertAppSurfaceEntryEdge,
  assertNoAutoLayoutOverlap,
  assertNoLegacyFields,
  assertNoLegacyKeysInJson,
  assertThrows,
  createProcurementFlow,
  FakeMemento,
  loadAutoLayoutHelpers,
  loadCanvasCardDragHelpers,
  loadCanvasDeleteSelectionHelpers,
  loadCanvasNodeClipboardHelpers,
  loadCanvasSelectAllShortcutHelpers,
  loadCanvasViewSelectionHelpers,
  loadCanvasViewportHelpers,
  loadEndpointCodecHelpers,
  loadSelectionRelationHighlightHelpers,
  loadSelectionRelationHelpers,
  requireNodeByTitle
} from "./helpers";

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
  for (const fileName of FLOW_WEBVIEW_STYLE_FILES) {
    await fs.readFile(path.join(process.cwd(), "assets", "webview", "canvas", "media", fileName));
  }
  for (const fileName of FLOW_WEBVIEW_SCRIPT_FILES) {
    await fs.readFile(path.join(process.cwd(), "out", "webview", "canvas", fileName));
  }
});

test("FlowPanel webview uses one bundled script instead of legacy multi-script entrypoints", () => {
  assert.deepEqual([...FLOW_WEBVIEW_SCRIPT_FILES], ["flowEditor.js"]);

  const html = createFlowWebviewHtml({
    cspSource: "vscode-resource:",
    nonce: "test-nonce",
    styleUris: FLOW_WEBVIEW_STYLE_FILES.map((fileName) => `media/${fileName}`),
    scriptUris: FLOW_WEBVIEW_SCRIPT_FILES.map((fileName) => `media/${fileName}`),
    initialState: { flowPath: "sample.mindflow" }
  });

  assert.ok(html.includes("media/flowEditor.js"));
  assert.equal(html.includes("media/state/canvas-state.js"), false);
  assert.equal(html.includes("media/events/canvas-bindings.js"), false);
});

test("Flow editor updates initialized webviews without replacing their HTML", async () => {
  const [sessionSource, clientSource] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "src", "platform", "vscode", "editor", "canvas", "FlowEditorSession.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src", "platform", "webview", "canvas", "client", "data", "canvas-ui-state.ts"), "utf8")
  ]);

  assert.ok(sessionSource.includes('postMessage({ type: "flowChanged", flow })'));
  assert.ok(clientSource.includes('message.type === "flowChanged"'));
});

test("Sidebar webview loads stylesheet from sidebar media", async () => {
  const [viewSource, htmlSource] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "src", "platform", "vscode", "sidebar", "SidebarView.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src", "platform", "vscode", "sidebar", "sidebarHtml.ts"), "utf8")
  ]);

  assert.ok(viewSource.includes("\"assets\", \"webview\", \"sidebar\", \"media\""));
  assert.ok(htmlSource.includes("\"assets\", \"webview\", \"sidebar\", \"media\", \"sidebar.css\""));
  assert.equal(`${viewSource}\n${htmlSource}`.includes("\"src\", \"canvas\", \"media\""), false);
});

test("Overview and application cards summarize long copy while inspectors expose full multiline fields", async () => {
  const [inspectorSource, projectStyles, cardStyles, inspectorStyles] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/rendering/canvas-taxonomy-inspector.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-project-overview.css"), "utf8"),
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-cards.css"), "utf8"),
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-inspector.css"), "utf8")
  ]);

  assert.ok(inspectorSource.includes('id="projectOverviewSummary" class="long-form-copy" rows="10"'));
  assert.ok(inspectorSource.includes('id="projectOverviewGoal" class="long-form-copy" rows="8"'));
  assert.ok(inspectorSource.includes('id="appSurfaceDescription" class="long-form-copy" rows="8"'));
  assert.ok(projectStyles.includes("white-space: pre-line"));
  assert.ok(projectStyles.includes("-webkit-line-clamp: 2"));
  assert.ok(cardStyles.includes(".app-surface-card > .purpose"));
  assert.ok(cardStyles.includes("-webkit-line-clamp: 4"));
  assert.ok(inspectorStyles.includes("textarea.long-form-copy"));
  assert.ok(inspectorStyles.includes("white-space: pre-wrap"));
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

test("Selection relation card highlight is transient, exclusive, and restarts without changing selection", async () => {
  const createCard = () => {
    const classes = new Set<string>(["selected"]);
    return {
      offsetWidth: 300,
      classList: {
        add(value: string) {
          classes.add(value);
        },
        remove(value: string) {
          classes.delete(value);
        }
      },
      hasClass(value: string) {
        return classes.has(value);
      }
    };
  };
  const cards = {
    "node:node_a": createCard(),
    "appSurface:app_admin": createCard(),
    "projectOverview:projectOverview": createCard()
  };
  const timers = new Map<number, { callback: () => void; durationMs: number }>();
  const clearedTimers: number[] = [];
  let nextTimerId = 1;
  const highlight = await loadSelectionRelationHighlightHelpers({
    getCardElement(kind, id) {
      return cards[`${kind}:${id}` as keyof typeof cards] || null;
    },
    setTimeout(callback, durationMs) {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, { callback, durationMs });
      return timerId;
    },
    clearTimeout(timer) {
      const timerId = Number(timer);
      clearedTimers.push(timerId);
      timers.delete(timerId);
    }
  });

  assert.equal(highlight.durationMs, 2400);
  assert.equal(highlight.flashSelectionRelationCard("node", "node_a"), true);
  assert.equal(cards["node:node_a"].hasClass("relation-card-highlight"), true);
  assert.equal(cards["node:node_a"].hasClass("selected"), true);
  assert.equal(timers.get(1)?.durationMs, 2400);

  assert.equal(highlight.flashSelectionRelationCard("appSurface", "app_admin"), true);
  assert.equal(cards["node:node_a"].hasClass("relation-card-highlight"), false);
  assert.equal(cards["appSurface:app_admin"].hasClass("relation-card-highlight"), true);
  assert.deepEqual(clearedTimers, [1]);

  assert.equal(highlight.flashSelectionRelationCard("appSurface", "app_admin"), true);
  assert.equal(cards["appSurface:app_admin"].hasClass("relation-card-highlight"), true);
  assert.deepEqual(clearedTimers, [1, 2]);

  assert.equal(highlight.flashSelectionRelationCard("projectOverview", "projectOverview"), true);
  assert.equal(cards["appSurface:app_admin"].hasClass("relation-card-highlight"), false);
  assert.equal(cards["projectOverview:projectOverview"].hasClass("relation-card-highlight"), true);
  timers.get(4)?.callback();
  assert.equal(cards["projectOverview:projectOverview"].hasClass("relation-card-highlight"), false);
  assert.equal(cards["projectOverview:projectOverview"].hasClass("selected"), true);

  assert.equal(highlight.flashSelectionRelationCard("node", "missing"), false);
});

test("Relation and node-list focus share smooth adaptive camera behavior without sharing highlight state", async () => {
  const [relationSource, canvasViewSource, bindingsSource, cameraSource, panSource, cardStyles] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/rendering/canvas-selection-relations.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/data/canvas-view.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-element-bindings.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-camera.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-pan.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-cards.css"), "utf8")
  ]);

  assert.ok(relationSource.includes('centerCard(button.dataset.relationCardKind, button.dataset.relationCardId, { fitToViewport: true, animate: true })'));
  assert.ok(canvasViewSource.includes('centerCard("node", nodeId, { fitToViewport: true, animate: true });'));
  assert.ok(canvasViewSource.includes("if (center && selectedNodeIds.includes(nodeId))"));
  assert.ok(bindingsSource.includes("selectNode(nodeId, true, { multi });"));
  assert.ok(bindingsSource.includes("selectNode(nodeId, false, { multi });"));
  assert.ok(cameraSource.includes('requestAnimationFrame(step)'));
  assert.ok(cameraSource.includes('cancelCanvasViewportAnimation();'));
  assert.ok(cameraSource.includes('applyCamera({ persist: complete })'));
  assert.ok(cameraSource.includes('window.matchMedia?.("(prefers-reduced-motion: reduce)")'));
  assert.ok(panSource.includes('cancelCanvasViewportAnimation();'));
  assert.ok(relationSource.includes("flashSelectionRelationCard(button.dataset.relationCardKind, button.dataset.relationCardId)"));
  assert.equal(canvasViewSource.includes("flashSelectionRelationCard"), false);
  assert.equal(relationSource.includes("selectNode(button.dataset.relationCardId"), false);
  assert.ok(cardStyles.includes(".node-card.relation-card-highlight::after"));
  assert.ok(cardStyles.includes(".app-surface-card.relation-card-highlight::after"));
  assert.ok(cardStyles.includes(".project-overview-card.relation-card-highlight::after"));
  assert.ok(cardStyles.includes("animation: relation-card-highlight-pulse 800ms ease-in-out 3"));
  assert.ok(cardStyles.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(cardStyles.includes("pointer-events: none"));
});

test("Canvas blank space uses the default pointer while interactive states keep their cursors", async () => {
  const [canvasStyles, cardStyles, overviewStyles, inspectorStyles] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-canvas.css"), "utf8"),
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-cards.css"), "utf8"),
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-project-overview.css"), "utf8"),
    fs.readFile(path.join(process.cwd(), "assets/webview/canvas/media/styles-inspector.css"), "utf8")
  ]);

  assert.match(canvasStyles, /\.canvas\s*\{[^}]*cursor:\s*default;/s);
  assert.match(canvasStyles, /\.canvas\.panning\s*\{[^}]*cursor:\s*grabbing;/s);
  assert.match(canvasStyles, /\.edge-hitarea\s*\{[^}]*cursor:\s*pointer;/s);
  assert.match(cardStyles, /\.node-card\s*\{[^}]*cursor:\s*grab;/s);
  assert.match(cardStyles, /\.app-surface-card\s*\{[^}]*cursor:\s*pointer;/s);
  assert.match(cardStyles, /\.origin-dot,[\s\S]*?\.target-dot\s*\{[^}]*cursor:\s*crosshair;/s);
  assert.match(overviewStyles, /\.project-overview-card\s*\{[^}]*cursor:\s*grab;/s);
  assert.match(inspectorStyles, /\.inspector h2\.inline-title-editor\s*\{[^}]*cursor:\s*text;/s);
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

test("Relation card focus uses 100% for normal cards and centers them", async () => {
  const { canvasViewportFocusForCard } = await loadCanvasViewportHelpers();
  const focused = canvasViewportFocusForCard(
    { x: 2000, y: 1000, width: 300, height: 220 },
    { width: 800, height: 600 }
  );

  assert.deepEqual(focused, {
    zoom: 1,
    camera: { x: -1750, y: -810 }
  });
});

test("Relation card focus shrinks tall cards to preserve 64px viewport padding", async () => {
  const { canvasViewportFocusForCard } = await loadCanvasViewportHelpers();
  const card = { x: 400, y: 300, width: 300, height: 900 };
  const focused = canvasViewportFocusForCard(card, { width: 800, height: 600 });

  assert.ok(focused);
  assert.equal(focused.zoom, 472 / 900);
  assert.equal(Math.round(card.y * focused.zoom + focused.camera.y), 64);
  assert.equal(Math.round((card.y + card.height) * focused.zoom + focused.camera.y), 536);
});

test("Relation card focus respects zoom bounds and rejects unavailable geometry", async () => {
  const { canvasViewportFocusForCard } = await loadCanvasViewportHelpers();

  assert.equal(canvasViewportFocusForCard(
    { x: 0, y: 0, width: 1000, height: 1000 },
    { width: 10, height: 10 }
  )?.zoom, 0.05);
  assert.equal(canvasViewportFocusForCard(
    { x: 0, y: 0, width: 100, height: 100 },
    { width: 1000, height: 1000 }
  )?.zoom, 1);
  assert.equal(canvasViewportFocusForCard(
    { x: 0, y: 0, width: 0, height: 100 },
    { width: 1000, height: 1000 }
  ), null);
});

test("Relation card camera animation uses distance-aware timing within 280-600ms", async () => {
  const { canvasViewportAnimationDuration } = await loadCanvasViewportHelpers();
  const start = { zoom: 1, camera: { x: 0, y: 0 } };

  assert.equal(canvasViewportAnimationDuration(start, start), 280);
  assert.equal(canvasViewportAnimationDuration(start, { zoom: 0.5, camera: { x: 1000, y: 0 } }), 514);
  assert.equal(canvasViewportAnimationDuration(start, { zoom: 0.1, camera: { x: 5000, y: 5000 } }), 600);
});

test("Relation card camera animation eases pan and zoom to the exact target", async () => {
  const { canvasViewportAnimationState, canvasViewportAnimationIsSettled } = await loadCanvasViewportHelpers();
  const start = { zoom: 0.5, camera: { x: 0, y: 100 } };
  const target = { zoom: 1, camera: { x: 800, y: -300 } };

  assert.deepEqual(canvasViewportAnimationState(start, target, 0), start);
  assert.deepEqual(canvasViewportAnimationState(start, target, 0.5), {
    zoom: 0.9375,
    camera: { x: 700, y: -250 }
  });
  assert.deepEqual(canvasViewportAnimationState(start, target, 1), target);
  assert.equal(canvasViewportAnimationIsSettled(start, target), false);
  assert.equal(canvasViewportAnimationIsSettled(target, {
    zoom: 1.0005,
    camera: { x: 800.2, y: -300.2 }
  }), true);
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
  const subnavigation = createFlowNode(flow, { title: "内容子导航", pageType: "navigation", appSurfaceIds: ["app_admin"] });
  const topbar = createFlowNode(flow, { title: "后台顶栏", pageType: "component", appSurfaceIds: ["app_admin"] });
  const pageA = createFlowNode(flow, { title: "采购列表", pageType: "page", appSurfaceIds: ["app_admin"] });
  const pageB = createFlowNode(flow, { title: "采购详情", pageType: "page", appSurfaceIds: ["app_admin"] });
  const popup = createFlowNode(flow, { title: "确认弹窗", pageType: "popup", appSurfaceIds: ["app_admin"] });
  const component = createFlowNode(flow, { title: "报价组件", pageType: "component", appSurfaceIds: ["app_supplier", "app_admin"] });
  const shared = createFlowNode(flow, { title: "共享组件", pageType: "component", appSurfaceIds: [] });
  const longTrigger = "这是一个非常长的连线标题用于验证自动排版会保留足够横向展示空间";
  const skeletonGroup = skeleton.featureGroups[0]!;
  createFlowEdge(flow, { from: { kind: "featureGroup", nodeId: skeleton.nodeId, groupId: skeletonGroup.groupId }, to: { kind: "node", nodeId: navigation.nodeId }, trigger: "主导航布局", type: "nestedRelation" });
  createFlowEdge(flow, { from: { kind: "featureGroup", nodeId: skeleton.nodeId, groupId: skeletonGroup.groupId }, to: { kind: "node", nodeId: subnavigation.nodeId }, trigger: "子导航布局", type: "nestedRelation" });
  createFlowEdge(flow, { from: { kind: "featureGroup", nodeId: skeleton.nodeId, groupId: skeletonGroup.groupId }, to: { kind: "node", nodeId: topbar.nodeId }, trigger: "顶栏布局", type: "nestedRelation" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: navigation.nodeId }, to: { kind: "node", nodeId: pageA.nodeId }, trigger: longTrigger, type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: pageA.nodeId }, to: { kind: "node", nodeId: popup.nodeId }, trigger: "打开确认", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: pageA.nodeId }, to: { kind: "node", nodeId: pageB.nodeId }, trigger: "查看详情", type: "interaction" });

  const layout = autoLayoutComputePreview(flow);

  assert.ok(layout.projectOverviewPosition.x < layout.appSurfacePositions.app_admin!.x);
  assert.ok(layout.appSurfacePositions.app_admin!.x < layout.nodePositions[skeleton.nodeId]!.x);
  assert.ok(layout.nodePositions[skeleton.nodeId]!.x < layout.nodePositions[navigation.nodeId]!.x);
  assert.equal(layout.items.find((item) => item.id === navigation.nodeId)?.layer, layout.items.find((item) => item.id === subnavigation.nodeId)?.layer);
  assert.equal(layout.items.find((item) => item.id === navigation.nodeId)?.layer, layout.items.find((item) => item.id === topbar.nodeId)?.layer);
  assert.notEqual(layout.nodePositions[navigation.nodeId]!.y, layout.nodePositions[subnavigation.nodeId]!.y);
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

  assert.equal(parseWebviewMessage({
    type: "createEdge",
    from: { kind: "appSurface", nodeId: "app_admin" },
    to: { kind: "node", nodeId: "node_b" },
    trigger: "进入",
    edgeType: "interaction"
  }), undefined);
  assert.deepEqual(parseWebviewMessage({
    type: "createEdge",
    from: { kind: "appSurface", nodeId: "app_admin", appId: "app_admin" },
    to: { kind: "node", nodeId: "node_b" },
    trigger: "进入",
    edgeType: "interaction"
  }), {
    type: "createEdge",
    from: { kind: "appSurface", nodeId: "app_admin", appId: "app_admin" },
    to: { kind: "node", nodeId: "node_b" },
    trigger: "进入",
    edgeType: "interaction"
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

test("Node clipboard payload is versioned, strict, and accepted by webview messages", () => {
  const payload = sampleNodeClipboardPayload();
  const text = serializeMindFlowNodeClipboard(payload);
  assert.deepEqual(parseMindFlowNodeClipboard(text), payload);
  assert.deepEqual(parseWebviewMessage({ type: "copyNodes", payload }), { type: "copyNodes", payload });
  assert.deepEqual(parseWebviewMessage({ type: "pasteNodesAt", x: 120.4, y: -80.2 }), {
    type: "pasteNodesAt",
    x: 120.4,
    y: -80.2
  });

  assert.equal(parseMindFlowNodeClipboard("ordinary clipboard text"), undefined);
  assert.equal(parseMindFlowNodeClipboard(JSON.stringify({ ...payload, version: 2 })), undefined);
  assert.equal(parseWebviewMessage({ type: "pasteNodesAt", x: Number.NaN, y: 20 }), undefined);
  assert.equal(parseWebviewMessage({
    type: "copyNodes",
    payload: {
      ...payload,
      nodes: [{
        ...payload.nodes[0],
        featureGroups: [{
          ...payload.nodes[0]!.featureGroups[0],
          actions: [{ actionId: "action_open", label: "打开", type: "user", targetNodeId: "node_external" }]
        }]
      }]
    }
  }), undefined);
});

test("Canvas node clipboard and select-all shortcuts support Meta and Control without hijacking text editing", async () => {
  const [clipboardSource, bindingSource, interactionSource, viewSource] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-node-clipboard.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-bindings.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-interactions.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/platform/webview/canvas/client/data/canvas-view.ts"), "utf8")
  ]);

  assert.ok(clipboardSource.includes("event.metaKey || event.ctrlKey"));
  assert.ok(clipboardSource.includes("!event.altKey && !event.shiftKey"));
  assert.ok(clipboardSource.includes("isEditingTarget(event.target)"));
  assert.ok(clipboardSource.includes("state.flow.nodes"));
  assert.ok(clipboardSource.includes('node.status !== "removed"'));
  assert.ok(clipboardSource.includes("targetNodeId: _targetNodeId"));
  assert.ok(bindingSource.includes('canvas.addEventListener("pointerenter", trackCanvasClipboardPointer)'));
  assert.ok(bindingSource.includes('canvas.addEventListener("pointerleave", clearCanvasClipboardPointer)'));
  assert.ok(interactionSource.includes("handleNodeClipboardShortcut(event)"));
  assert.ok(interactionSource.includes("handleSelectAllNodesShortcut(event)"));
  assert.ok(interactionSource.includes("isEditingTarget(event.target)"));
  assert.ok(interactionSource.includes('String(event.key || "").toLowerCase() !== "a"'));
  assert.ok(interactionSource.includes("event.preventDefault()"));
  assert.ok(interactionSource.includes("event.stopPropagation()"));
  assert.ok(interactionSource.includes("clearNativeDocumentSelection()"));
  assert.ok(interactionSource.includes("selectAllNodes()"));
  const selectAllSource = viewSource.match(/function selectAllNodes\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(selectAllSource.includes('selectedEdgeId = ""'));
  assert.ok(selectAllSource.includes("selectedProjectOverview = false"));
  assert.ok(selectAllSource.includes('postWebviewMessage({ type: "selectNode", nodeId: selectedNodeId, selectedNodeIds })'));
  assert.ok(selectAllSource.includes("focusCanvas()"));
  assert.equal(selectAllSource.includes("centerCard"), false);
});

test("Canvas select-all owns Meta and Control shortcuts while preserving native editing", async () => {
  const editingTarget = {};
  let selectedCount = 0;
  let nativeSelectionClearCount = 0;
  const helpers = await loadCanvasSelectAllShortcutHelpers({
    isEditingTarget: (target) => target === editingTarget,
    selectAllNodes: () => {
      selectedCount += 1;
      return false;
    },
    getSelection: () => ({
      rangeCount: 1,
      removeAllRanges: () => {
        nativeSelectionClearCount += 1;
      }
    })
  });
  let preventedCount = 0;
  let stoppedCount = 0;
  const createEvent = (overrides: Record<string, unknown> = {}) => ({
    key: "a",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: {},
    preventDefault: () => {
      preventedCount += 1;
    },
    stopPropagation: () => {
      stoppedCount += 1;
    },
    ...overrides
  });

  assert.equal(helpers.handleSelectAllNodesShortcut(createEvent({ metaKey: true })), true);
  assert.equal(helpers.handleSelectAllNodesShortcut(createEvent({ ctrlKey: true })), true);
  assert.equal(selectedCount, 2);
  assert.equal(nativeSelectionClearCount, 2);
  assert.equal(preventedCount, 2);
  assert.equal(stoppedCount, 2);

  assert.equal(helpers.handleSelectAllNodesShortcut(createEvent({ metaKey: true, target: editingTarget })), false);
  assert.equal(helpers.handleSelectAllNodesShortcut(createEvent({ ctrlKey: true, shiftKey: true })), false);
  assert.equal(selectedCount, 2);
  assert.equal(preventedCount, 2);
});

test("Canvas select-all includes every active generic node and preserves a valid primary node", async () => {
  const flow = createEmptyProductFlow();
  const first = createFlowNode(flow, { title: "列表页" });
  const second = createFlowNode(flow, { title: "详情页" });
  const removed = createFlowNode(flow, { title: "已删除页" });
  removed.status = "removed";
  const helpers = await loadCanvasViewSelectionHelpers();

  assert.deepEqual(helpers.allNodeSelectionForFlow(flow, second.nodeId), {
    nodeIds: [first.nodeId, second.nodeId],
    primaryNodeId: second.nodeId
  });
  assert.deepEqual(helpers.allNodeSelectionForFlow(flow, removed.nodeId), {
    nodeIds: [first.nodeId, second.nodeId],
    primaryNodeId: first.nodeId
  });
  assert.equal(helpers.allNodeSelectionForFlow(createEmptyProductFlow(), ""), null);
});

test("Canvas multi-selection drag moves every selected active node by one shared world delta", async () => {
  const flow = createEmptyProductFlow();
  const first = createFlowNode(flow, { title: "列表页" });
  const second = createFlowNode(flow, { title: "详情页" });
  const unselected = createFlowNode(flow, { title: "弹窗" });
  const removed = createFlowNode(flow, { title: "已删除页" });
  removed.status = "removed";
  const selectedNodeIds = [first.nodeId, second.nodeId, removed.nodeId];
  const cards = new Map([
    [first.nodeId, { id: first.nodeId }],
    [second.nodeId, { id: second.nodeId }],
    [unselected.nodeId, { id: unselected.nodeId }]
  ]);
  const helpers = await loadCanvasCardDragHelpers({
    state: { flow },
    selectedNodeIds,
    nodePositions: new Map([
      [first.nodeId, { x: 100, y: 220 }],
      [second.nodeId, { x: 430, y: 510 }],
      [unselected.nodeId, { x: 760, y: 260 }]
    ]),
    isNodeSelected: (nodeId) => selectedNodeIds.includes(nodeId),
    getCardElement: (_kind, nodeId) => cards.get(nodeId) || null
  });

  const members = helpers.selectedNodeDragMembers(second.nodeId);
  assert.deepEqual(members.map((member) => member.id), [first.nodeId, second.nodeId]);
  assert.deepEqual(helpers.nodeGroupDragPositions(members, 75, -35, 0.5), [
    { id: first.nodeId, x: 250, y: 150 },
    { id: second.nodeId, x: 580, y: 440 }
  ]);
  assert.deepEqual(helpers.selectedNodeDragMembers(unselected.nodeId), []);
});

test("Canvas multi-selection drag submits atomic moves and moved unselected cards become single selection", async () => {
  const dragSource = await fs.readFile(
    path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-card-drag.ts"),
    "utf8"
  );
  const groupEndSource = dragSource.match(/if \(moved && kind === "node" && groupMembers\.length > 1\) \{[\s\S]*?\n  \}/)?.[0] || "";

  assert.ok(dragSource.includes('draggingCards.forEach((draggingCard) => draggingCard.classList.add("dragging"))'));
  assert.ok(dragSource.includes("nodeGroupDragPositions(dragState.groupMembers, screenDx, screenDy, zoom)"));
  assert.ok(groupEndSource.includes('autoLayoutUpdatePreviewPosition("node"'));
  assert.ok(groupEndSource.includes('postWebviewMessage({ type: "flow.operations", operations })'));
  assert.equal(groupEndSource.includes("selectNode("), false);
  assert.ok(dragSource.includes("selectNode(id, false);"));
});

test("Canvas multi-selection Delete and Backspace emit one active-node removal batch", async () => {
  const flow = createEmptyProductFlow();
  const first = createFlowNode(flow, { title: "列表页" });
  const second = createFlowNode(flow, { title: "详情页" });
  const removed = createFlowNode(flow, { title: "已删除页" });
  removed.status = "removed";
  const messages: unknown[] = [];
  let clearedSelectionCount = 0;
  let clearedTimerCount = 0;
  const helpers = await loadCanvasDeleteSelectionHelpers({
    state: { flow },
    selectedNodeIds: [first.nodeId, removed.nodeId, second.nodeId],
    postWebviewMessage: (message) => messages.push(message),
    clearNodeSelectionState: () => {
      clearedSelectionCount += 1;
    },
    clearTimeout: () => {
      clearedTimerCount += 1;
    }
  });

  assert.equal(helpers.deleteSelectedNodes(), true);
  assert.deepEqual(messages, [{
    type: "flow.operations",
    operations: [
      { type: "node.remove", nodeId: first.nodeId },
      { type: "node.remove", nodeId: second.nodeId }
    ]
  }]);
  assert.equal(clearedSelectionCount, 1);
  assert.equal(clearedTimerCount, 1);

  const interactionSource = await fs.readFile(
    path.join(process.cwd(), "src/platform/webview/canvas/client/interactions/canvas-interactions.ts"),
    "utf8"
  );
  assert.ok(interactionSource.includes('event.key !== "Delete" && event.key !== "Backspace"'));
  assert.equal(interactionSource.includes('event.key === "Arrow'), false);
  assert.ok(interactionSource.indexOf("isEditingTarget(event.target)") < interactionSource.indexOf("deleteSelectedNodes()"));
});

test("Canvas node clipboard copies every active selected node with left-top relative offsets", async () => {
  const flow = createEmptyProductFlow();
  const first = createFlowNode(flow, {
    title: "列表页",
    featureGroups: [{
      groupId: "group_main",
      name: "主操作",
      type: "section",
      description: "操作区。",
      items: [],
      actions: [{ actionId: "action_open", label: "打开", type: "user", targetNodeId: "node_external" }]
    }]
  });
  const second = createFlowNode(flow, { title: "详情页" });
  const removed = createFlowNode(flow, { title: "已删除页" });
  removed.status = "removed";
  const copyMessages: unknown[] = [];
  const helpers = await loadCanvasNodeClipboardHelpers({
    state: { flow },
    selectedNodeIds: [first.nodeId, second.nodeId, removed.nodeId],
    selectedNodeId: second.nodeId,
    nodePositions: new Map([
      [first.nodeId, { x: 500, y: 320 }],
      [second.nodeId, { x: 860, y: 180 }],
      [removed.nodeId, { x: 1200, y: 600 }]
    ]),
    postWebviewMessage: (message) => copyMessages.push(message)
  });
  const payload = helpers.createSelectedNodeClipboardPayload() as {
    primaryIndex: number;
    nodes: Array<Record<string, unknown> & { featureGroups: Array<{ actions?: Array<Record<string, unknown>> }> }>;
  };

  assert.equal(payload.nodes.length, 2);
  assert.equal(payload.primaryIndex, 1);
  assert.deepEqual(payload.nodes.map((node) => [node.offsetX, node.offsetY]), [[0, 140], [360, 0]]);
  assert.equal("inputs" in payload.nodes[0]!, false);
  assert.equal("outputs" in payload.nodes[0]!, false);
  assert.equal("targetNodeId" in payload.nodes[0]!.featureGroups[0]!.actions![0]!, false);
  assert.equal(helpers.isCanvasCommandModifier({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), true);
  assert.equal(helpers.isCanvasCommandModifier({ metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }), true);
  assert.equal(helpers.isCanvasCommandModifier({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), false);
  let successfulCopyPrevented = 0;
  let successfulCopyStopped = 0;
  assert.equal(helpers.handleNodeClipboardShortcut({
    key: "c",
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    target: {},
    preventDefault: () => {
      successfulCopyPrevented += 1;
    },
    stopPropagation: () => {
      successfulCopyStopped += 1;
    }
  }), true);
  assert.equal(successfulCopyPrevented, 1);
  assert.equal(successfulCopyStopped, 1);
  assert.deepEqual(copyMessages, [{ type: "copyNodes", payload }]);

  const clipboardMessages: unknown[] = [];
  const commandStatuses: Array<{ ok: boolean; message: string }> = [];
  let preventedCount = 0;
  let stoppedCount = 0;
  let statusUpdateCount = 0;
  const nonNodeSelection = await loadCanvasNodeClipboardHelpers({
    state: { flow },
    selectedNodeIds: [],
    selectedNodeId: "",
    nodePositions: new Map(),
    postWebviewMessage: (message) => clipboardMessages.push(message),
    setCommandStatus: (ok, message) => commandStatuses.push({ ok, message }),
    updateCommandStatusElement: () => {
      statusUpdateCount += 1;
    }
  });
  assert.equal(nonNodeSelection.createSelectedNodeClipboardPayload(), null);
  assert.equal(nonNodeSelection.handleNodeClipboardShortcut({
    key: "c",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: {},
    preventDefault: () => {
      preventedCount += 1;
    },
    stopPropagation: () => {
      stoppedCount += 1;
    }
  }), true);
  assert.equal(preventedCount, 1);
  assert.equal(stoppedCount, 1);
  assert.deepEqual(clipboardMessages, []);
  assert.deepEqual(commandStatuses, [{ ok: false, message: "当前没有可复制的普通节点。" }]);
  assert.equal(statusUpdateCount, 1);

  const editingClipboard = await loadCanvasNodeClipboardHelpers({
    state: { flow },
    selectedNodeIds: [first.nodeId],
    selectedNodeId: first.nodeId,
    nodePositions: new Map([[first.nodeId, { x: 500, y: 320 }]]),
    isEditingTarget: () => true
  });
  assert.equal(editingClipboard.handleNodeClipboardShortcut({
    key: "c",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: {}
  }), false);
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
    edgeType: "interaction"
  }, dispatcher.dispatcher);

  assert.deepEqual(dispatcher.selection, {
    ...emptyFlowSelection(),
    selectedProjectOverview: false,
    selectedNodeId: "node_a",
    selectedNodeIds: ["node_a", "node_b"]
  });
  assert.deepEqual(dispatcher.operations, [
    {
      label: "保存节点位置",
      operations: [{ type: "node.move", nodeId: "node_a", x: 12.2, y: 34.8 }]
    },
    {
      label: "应用自动排版",
      operations: [
        { type: "project.move", x: 0, y: 10 },
        { type: "appSurface.move", appId: "app_admin", x: 520, y: 120 },
        { type: "node.move", nodeId: "node_a", x: 1040, y: 240 },
        { type: "node.move", nodeId: "node_b", x: 1560, y: 360 }
      ],
      options: { atomic: true }
    },
    {
      label: "创建连线",
      operations: [{
        type: "edge.upsert",
        input: {
          from: { kind: "node", nodeId: "node_a" },
          to: { kind: "node", nodeId: "node_b" },
          trigger: "进入下一页",
          type: "interaction"
        }
      }]
    }
  ]);
});

test("Flow webview dispatcher uses the system clipboard and pastes nodes atomically", async () => {
  const dispatcher = createDispatcherHarness();
  const payload = sampleNodeClipboardPayload();

  await dispatchFlowWebviewMessage({ type: "copyNodes", payload }, dispatcher.dispatcher);
  assert.deepEqual(parseMindFlowNodeClipboard(dispatcher.clipboardText), payload);
  assert.deepEqual(dispatcher.commandResults, [{ ok: true, message: "已复制 1 个节点。" }]);

  await dispatchFlowWebviewMessage({ type: "pasteNodesAt", x: 800, y: 520 }, dispatcher.dispatcher);
  assert.deepEqual(dispatcher.operations, [{
    label: "粘贴节点",
    operations: [{
      type: "node.paste",
      request: {
        nodes: payload.nodes,
        primaryIndex: 0,
        x: 800,
        y: 520
      }
    }],
    options: { atomic: true }
  }]);

  dispatcher.setClipboardText("not a MindFlow clipboard");
  await dispatchFlowWebviewMessage({ type: "pasteNodesAt", x: 10, y: 20 }, dispatcher.dispatcher);
  assert.equal(dispatcher.operations.length, 1);
  assert.deepEqual(dispatcher.commandResults.at(-1), {
    ok: false,
    message: "系统剪贴板中没有可粘贴的 MindFlow 节点，请先使用 Cmd/Ctrl+C 复制已选节点。"
  });
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
  assert.deepEqual(dispatcher.operations, [
    {
      label: "更新元数据",
      operations: [{ type: "taxonomy.remove", kind: "domain", id: "domain_ops" }]
    }
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

  assert.deepEqual(dispatcher.operations, [
    {
      label: "更新连线详情",
      operations: [{
        type: "edge.update",
        edgeId: "edge_a",
        patch: {
          from: { kind: "node", nodeId: "node_a" },
          to: { kind: "node", nodeId: "node_b" }
        }
      }]
    }
  ]);
});

function createDispatcherHarness(initialSelection: FlowSelectionPatch = emptyFlowSelection()) {
  const documentUri = "file:///workspace/sample.mindflow" as unknown as vscode.Uri;
  const operations: Array<{ label: string; operations: readonly unknown[]; options?: unknown }> = [];
  const commandResults: Array<{ ok: boolean; message: string }> = [];
  let selection: FlowSelectionState = { ...emptyFlowSelection(), ...initialSelection };
  let clipboardText = "";

  return {
    documentUri,
    operations,
    commandResults,
    setClipboardText(value: string) {
      clipboardText = value;
    },
    get clipboardText() {
      return clipboardText;
    },
    get selection() {
      return selection;
    },
    dispatcher: {
      documentUri,
      latestEdgeDetailsRevisions: new Map<string, number>(),
      clipboard: {
        readText: async () => clipboardText,
        writeText: async (value: string) => {
          clipboardText = value;
        }
      },
      postCommandResult: (ok: boolean, message: string) => {
        commandResults.push({ ok, message });
      },
      selectionController: {
        getSelection: () => ({ ...selection }),
        setSelection: (_flowUri: vscode.Uri | string, patch: FlowSelectionPatch) => {
          selection = { ...emptyFlowSelection(), ...patch };
        }
      },
      applyOperations: async (label: string, appliedOperations: readonly unknown[], options?: unknown) => {
        operations.push({
          label,
          operations: appliedOperations,
          ...(options ? { options } : {})
        });
      }
    }
  };
}

function sampleNodeClipboardPayload(): MindFlowNodeClipboardPayload {
  return {
    kind: MINDFLOW_NODE_CLIPBOARD_KIND,
    version: MINDFLOW_NODE_CLIPBOARD_VERSION,
    primaryIndex: 0,
    nodes: [{
      title: "工作台",
      pageType: "page",
      purpose: "处理运营任务。",
      appSurfaceIds: ["app_admin"],
      statusGroupId: "status_review",
      domainIds: ["domain_ops"],
      roleIds: ["role_ops"],
      permissions: ["role_ops"],
      featureGroups: [{
        groupId: "group_actions",
        name: "操作区",
        type: "section",
        description: "页面操作。",
        items: [{ itemId: "item_open", name: "打开", type: "button", description: "打开详情。" }],
        actions: [{ actionId: "action_open", label: "打开", type: "user" }]
      }],
      offsetX: 0,
      offsetY: 0
    }]
  };
}
