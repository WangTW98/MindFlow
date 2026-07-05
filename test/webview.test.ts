import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/core/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/core/canvasLayout";
import { createEmptyProductFlow } from "../src/core/emptyFlow";
import { createManualEdge, createManualNode, removeManualEdge, removeManualNode, updateManualAppSurfacePosition, updateManualEdgeDetails, updateManualNodeDetails, updateManualNodePosition } from "../src/core/flowEditing";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview } from "../src/core/projectOverview";
import { applyTaxonomyRequest } from "../src/core/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/core/taxonomyEditing";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/core/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/models/productFlow";
import { parseProductFlowText, serializeProductFlow } from "../src/models/productFlowCodec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/storage/flowRepository";
import { RecentFlowStore } from "../src/storage/recentFlows";
import { dispatchFlowWebviewMessage } from "../src/webview/flowCommandDispatcher";
import { emptyFlowSelection, type FlowSelectionPatch, type FlowSelectionState } from "../src/webview/flowSelection";
import { recordEdgeDetailsRevision } from "../src/webview/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, renderFlowWebviewHtml } from "../src/webview/flowWebviewHtml";
import { parseWebviewMessage } from "../src/webview/flowWebviewMessages";
import { parseSidebarMessage } from "../src/webview/sidebar/sidebarMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

test("FlowPanel webview HTML loads declared media resources in order", () => {
  const html = renderFlowWebviewHtml({
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
    await fs.readFile(path.join(process.cwd(), "src", "webview", "media", fileName));
  }
});

test("FlowPanel media scripts keep dependency order explicit", () => {
  const indexOf = (fileName: string) => {
    const index = FLOW_WEBVIEW_SCRIPT_FILES.indexOf(fileName as never);
    assert.ok(index !== -1, `${fileName} should be declared`);
    return index;
  };

  assert.ok(indexOf("state/canvas-namespace.js") < indexOf("state/canvas-state.js"));
  assert.ok(indexOf("state/canvas-state.js") < indexOf("render/canvas-render.js"));
  assert.ok(indexOf("render/canvas-render.js") < indexOf("events/canvas-camera.js"));
  assert.ok(indexOf("events/canvas-camera.js") < indexOf("events/canvas-pan.js"));
  assert.ok(indexOf("events/canvas-pan.js") < indexOf("events/canvas-connections.js"));
  assert.ok(indexOf("events/canvas-connections.js") < indexOf("events/canvas-card-drag.js"));
  assert.ok(indexOf("events/canvas-card-drag.js") < indexOf("events/canvas-interactions.js"));
  assert.ok(indexOf("events/canvas-interactions.js") < indexOf("events/canvas-bindings.js"));
  assert.ok(indexOf("events/canvas-bindings.js") < indexOf("view/canvas-endpoint-codec.js"));
  assert.ok(indexOf("view/canvas-endpoint-codec.js") < indexOf("view/canvas-picker-controls.js"));
  assert.ok(indexOf("view/canvas-picker-controls.js") < indexOf("view/canvas-endpoint-pickers.js"));
  assert.ok(indexOf("view/canvas-endpoint-pickers.js") < indexOf("view/canvas-edge-view.js"));
  assert.ok(indexOf("view/canvas-edge-view.js") < indexOf("view/canvas-view.js"));
  assert.ok(indexOf("view/canvas-view.js") < indexOf("data/canvas-feature-data.js"));
  assert.ok(indexOf("data/canvas-feature-data.js") < indexOf("data/canvas-taxonomy-data.js"));
  assert.ok(indexOf("data/canvas-taxonomy-data.js") < indexOf("data/canvas-color-data.js"));
  assert.ok(indexOf("data/canvas-color-data.js") < indexOf("data/canvas-ui-state.js"));
  assert.ok(indexOf("data/canvas-ui-state.js") < indexOf("data/canvas-data.js"));
  assert.equal(FLOW_WEBVIEW_SCRIPT_FILES[FLOW_WEBVIEW_SCRIPT_FILES.length - 1], "state/main.js");
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

test("Webview message parser rejects malformed messages before command dispatch", () => {
  assert.equal(parseWebviewMessage(null), undefined);
  assert.equal(parseWebviewMessage({ type: "saveNodePosition", nodeId: "node_a", x: Number.NaN, y: 20 }), undefined);
  assert.equal(parseWebviewMessage({ type: "saveProjectOverviewPosition", x: Number.POSITIVE_INFINITY, y: 20 }), undefined);
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
  await dispatchFlowWebviewMessage({ type: "selectNode", nodeId: "node_a" }, dispatcher.dispatcher);
  await dispatchFlowWebviewMessage({ type: "saveNodePosition", nodeId: "node_a", x: 12.2, y: 34.8 }, dispatcher.dispatcher);
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
    selectedNodeId: "node_a"
  });
  assert.deepEqual(dispatcher.commands, [
    ["保存节点位置", "mindflow.updateNodePosition", "node_a", 12.2, 34.8, dispatcher.documentUri],
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
          selection = { ...emptyFlowSelection(), ...selection, ...patch };
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

async function loadEndpointCodecHelpers(): Promise<EndpointCodecHelpers> {
  const source = await fs.readFile(
    path.join(process.cwd(), "src", "webview", "media", "view", "canvas-endpoint-codec.js"),
    "utf8"
  );
  const factory = new Function(
    "PROJECT_OVERVIEW_NODE_ID",
    "getFeatureGroups",
    `${source}\nreturn { encodeEndpoint, endpointFromButton, parseEndpointValue, endpointKey };`
  ) as (projectOverviewNodeId: string, getFeatureGroups: (node: unknown) => unknown[]) => EndpointCodecHelpers;
  return factory("projectOverview", () => []);
}
