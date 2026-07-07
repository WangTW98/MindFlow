import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/domain/operations/layout/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/domain/operations/layout/canvasLayout";
import { createEmptyProductFlow } from "../src/domain/product-flow/factory";
import { createManualEdge, createManualNode, removeManualEdge, removeManualNode, updateManualAppSurfacePosition, updateManualEdgeDetails, updateManualNodeDetails, updateManualNodePosition } from "../src/domain/operations/flowEditing";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview } from "../src/domain/operations/projectOverview";
import { applyTaxonomyRequest } from "../src/domain/operations/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/domain/operations/taxonomyEditing";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/vscode/documents/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/domain/product-flow";
import { parseProductFlowText, serializeProductFlow } from "../src/domain/product-flow/codec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/persistence/flowRepository";
import { RecentFlowStore } from "../src/vscode/state/recentFlows";
import { recordEdgeDetailsRevision } from "../src/vscode/webviews/canvas/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, renderFlowWebviewHtml } from "../src/vscode/webviews/canvas/flowWebviewHtml";
import { parseWebviewMessage } from "../src/webview/protocol/flowWebviewMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

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

test("Taxonomy status group details can be created and updated", () => {
  const flow = createEmptyProductFlow();

  applyTaxonomyRequest(flow, {
    kind: "statusGroup",
    action: "create",
    id: "status_review",
    item: {
      statusGroupId: "status_review",
      title: "评审中",
      description: "等待业务复核。",
      color: "#33aa55"
    }
  });

  let group = flow.statusGroups?.find((item) => item.statusGroupId === "status_review");
  assert.equal(group?.title, "评审中");
  assert.equal(group?.description, "等待业务复核。");
  assert.equal(group?.color, "#33aa55");

  applyTaxonomyRequest(flow, {
    kind: "statusGroup",
    action: "update",
    id: "status_review",
    item: {
      title: "已复核",
      description: "复核完成后进入下一阶段。",
      color: "#3366aa"
    }
  });

  group = flow.statusGroups?.find((item) => item.statusGroupId === "status_review");
  assert.equal(group?.title, "已复核");
  assert.equal(group?.description, "复核完成后进入下一阶段。");
  assert.equal(group?.color, "#3366aa");

  const validation = validateProductFlow(flow);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Taxonomy updates keep only known domain and role references", () => {
  const flow = createEmptyProductFlow();
  flow.domains = [{ domainId: "domain_known", name: "已知业务域", description: "可引用业务域。" }];
  flow.roles = [{ roleId: "role_known", name: "已知角色", description: "可引用角色。", domainIds: ["domain_known"] }];

  applyTaxonomyRequest(flow, {
    kind: "appSurface",
    action: "create",
    id: "app_known",
    item: {
      appId: "app_known",
      name: "管理后台",
      type: "admin",
      description: "后台应用端。",
      domainIds: ["domain_known", "domain_missing"],
      roleIds: ["role_known", "role_missing"]
    }
  });
  applyTaxonomyRequest(flow, {
    kind: "role",
    action: "update",
    id: "role_known",
    item: {
      domainIds: ["domain_known", "domain_missing"]
    }
  });

  assert.deepEqual(flow.appSurfaces?.[0]?.domainIds, ["domain_known"]);
  assert.deepEqual(flow.appSurfaces?.[0]?.roleIds, ["role_known"]);
  assert.deepEqual(flow.roles[0]?.domainIds, ["domain_known"]);
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
