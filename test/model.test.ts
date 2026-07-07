import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
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
import { recordEdgeDetailsRevision } from "../src/adapters/vscode/editor/canvas/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, createFlowWebviewHtml } from "../src/adapters/vscode/editor/canvas/webviewShellHtml";
import { parseWebviewMessage } from "../src/adapters/webview/protocol/flowWebviewMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

test("real-provider fixture creates a valid ProductFlow with app-surface entry edges", () => {
  const flow = createProcurementFlow();
  const validation = validateProductFlow(flow);

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(flow.appSurfaces?.length, 4);
  assert.ok(flow.nodes.length >= 15);
  assert.ok(flow.edges.length >= 20);
  assertAppSurfaceEntryEdge(flow, "app_admin", "采购工作台");
  assertAppSurfaceEntryEdge(flow, "app_supplier_portal", "供应商门户首页");
  assertAppSurfaceEntryEdge(flow, "app_mobile_approval", "移动审批待办");
  assertAppSurfaceEntryEdge(flow, "app_public_site", "采购公告列表");
});

test("Empty ProductFlow starts as a valid blank canvas", () => {
  const flow = createEmptyProductFlow();
  const validation = validateProductFlow(flow);

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(flow.schemaVersion, "2.0");
  assert.equal(flow.nodes.length, 0);
  assert.equal(flow.edges.length, 0);
  assert.equal(flow.projectOverview.summary, "Manually created blank MindFlow.");
  assert.equal(flow.projectOverview.goal, "");
  assert.equal(flow.domains.length, 0);
  assert.equal(flow.roles.length, 0);
  assert.equal(flow.appSurfaces?.length, 0);
  assert.equal(flow.statusGroups?.length, 0);
  assertNoLegacyFields(flow);
});

test("JSON schema edge type enum stays aligned with runtime validation", async () => {
  const raw = await fs.readFile(path.join(process.cwd(), "src", "domain", "product-flow", "schema", "productFlow.schema.json"), "utf8");
  const schema = JSON.parse(raw) as {
    $defs?: {
      edgeType?: {
        enum?: string[];
      };
    };
  };

  assert.deepEqual(schema.$defs?.edgeType?.enum, [...EDGE_TYPES]);
});

test("ProductFlow validation rejects invalid enums and stale references", () => {
  const flow = createEmptyProductFlow();
  const node = createFlowNode(flow, { title: "异常节点" });
  const record = node as unknown as Record<string, unknown>;
  record.status = "unknown";
  node.domainIds = ["missing_domain"];

  const validation = validateProductFlow(flow);

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("nodes[0].status must be")));
  assert.ok(validation.errors.some((error) => error.includes("references missing domain missing_domain")));
});

test("ProductFlow validation catches duplicate ids, invalid views, and endpoint references", () => {
  const flow = createEmptyProductFlow();
  flow.domains = [
    { domainId: "domain_ops", name: "运营", description: "运营业务域。" },
    { domainId: "domain_ops", name: "重复运营", description: "重复业务域。" }
  ];
  flow.roles = [{ roleId: "role_ops", name: "运营", description: "运营角色。", domainIds: ["domain_ops"] }];
  flow.appSurfaces = [
    { appId: "app_admin", name: "后台", type: "admin", description: "后台。", domainIds: ["domain_ops"], roleIds: ["role_ops"] },
    { appId: "app_admin", name: "重复后台", type: "admin", description: "重复后台。", domainIds: ["domain_ops"], roleIds: ["role_ops"] }
  ];
  flow.statusGroups = [{ statusGroupId: "status_review", title: "评审中", color: "#33aa55" }];
  const node = createFlowNode(flow, { title: "异常页面" });
  node.appSurfaceIds = ["missing_app"];
  node.statusGroupId = "missing_status";
  node.view = { position: { x: 12, y: Number.NaN } };
  const edge = createFlowEdge(flow, {
    from: { kind: "node", nodeId: node.nodeId },
    to: { kind: "node", nodeId: node.nodeId },
    trigger: "异常连线",
    type: "navigate"
  });
  edge.from = { kind: "featureGroup", nodeId: node.nodeId, groupId: "missing_group" };
  edge.to = { kind: "featureItem", nodeId: node.nodeId, groupId: "missing_group", itemId: "missing_item" };

  const validation = validateProductFlow(flow);

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("Duplicate domainId: domain_ops")));
  assert.ok(validation.errors.some((error) => error.includes("Duplicate appId: app_admin")));
  assert.ok(validation.errors.some((error) => error.includes("nodes[0].appSurfaceIds references missing app surface missing_app.")));
  assert.ok(validation.errors.some((error) => error.includes("nodes[0].view.position.y must be a number.")));
  assert.ok(validation.errors.some((error) => error.includes("edges[0].from.groupId references missing feature group missing_group")));
  assert.ok(validation.errors.some((error) => error.includes("edges[0].to.groupId references missing feature group missing_group")));
  assert.ok(validation.warnings.some((warning) => warning.includes("nodes[0].statusGroupId references missing status group missing_status.")));
});

test("Legacy ProductFlow missing projectOverview can be backfilled", () => {
  const flow = createEmptyProductFlow();
  delete (flow as unknown as { projectOverview?: unknown }).projectOverview;

  const result = ensureProjectOverview(flow);
  const validation = validateProductFlow(flow);

  assert.equal(result.changed, true);
  assert.equal(flow.projectOverview.summary, "Manually created blank MindFlow.");
  assert.equal(flow.projectOverview.goal, "");
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("Project overview details update local project metadata", () => {
  const flow = createEmptyProductFlow();

  updateProjectOverview(flow, {
    title: "供应链协同平台",
    summary: "覆盖采购、供应商和审批协同。",
    goal: "提升跨端采购协作效率。"
  });

  assert.equal(flow.title, "供应链协同平台");
  assert.equal(flow.projectOverview.summary, "覆盖采购、供应商和审批协同。");
  assert.equal(flow.projectOverview.goal, "提升跨端采购协作效率。");
  assert.equal(validateProductFlow(flow).valid, true);
});

test("Blank MindFlow creates valid untitled document content and a .mindflow file name", () => {
  const flow = createEmptyProductFlow();
  const options = createUntitledMindFlowDocumentOptions(flow);
  const suggestedFileName = createUntitledMindFlowFileName(flow);
  const validation = validateProductFlow(JSON.parse(options.content) as unknown);

  assert.equal(options.language, MINDFLOW_LANGUAGE_ID);
  assert.equal("uri" in options, false);
  assert.equal(suggestedFileName.startsWith("Untitled-MindFlow-"), true);
  assert.equal(suggestedFileName.endsWith(MINDFLOW_FILE_EXTENSION), true);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("ProductFlow codec migrates legacy generation fields to local v2", () => {
  const legacy = createProcurementFlow();
  const legacyRecord = legacy as unknown as Record<string, unknown>;
  const legacyNode = legacy.nodes[0] as unknown as Record<string, unknown>;
  const legacyEdge = legacy.edges[0] as unknown as Record<string, unknown>;

  legacyRecord.schemaVersion = "1.0";
  legacyRecord.sourceDocumentId = "samples/example-requirements.md";
  legacyRecord.sourceSummary = "旧版文档摘要";
  legacyRecord.projectOverview = { summary: "", goal: "" };
  legacyRecord.artifacts = { prds: [], pencils: [] };
  legacyRecord.changeHistory = [];
  legacyRecord.syncState = { issues: [] };
  legacyRecord.productDesignIssues = [{ issueId: "pdi_legacy", severity: "warning", title: "旧问题", description: "旧问题", prompt: "旧提示" }];
  legacyRecord.openQuestions = ["旧问题"];
  legacyNode.sourceRefs = [{ sourceId: "legacy", label: "legacy" }];
  legacyNode.artifacts = { prdIds: ["prd_legacy"], pencilIds: ["pencil_legacy"] };
  legacyNode.updatedByChangeSetId = "manual";
  legacyNode.confidence = 1;
  legacyEdge.sourceRefs = [{ sourceId: "legacy", label: "legacy" }];
  legacyEdge.removedByChangeSetId = "manual";
  legacyEdge.confidence = 1;

  const result = parseProductFlowText(`${JSON.stringify(legacyRecord, null, 2)}\n`, "legacy flow");

  assert.equal(result.migrated, true);
  assert.equal(result.flow.schemaVersion, "2.0");
  assert.equal(result.flow.projectOverview.summary, "旧版文档摘要");
  assert.equal(result.validation.valid, true);
  assertNoLegacyFields(result.flow);
  assertNoLegacyKeysInJson(serializeProductFlow(result.flow));
});
