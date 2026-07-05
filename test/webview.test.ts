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
