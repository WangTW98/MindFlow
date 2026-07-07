import { strict as assert } from "node:assert";
import test from "node:test";
import { createEmptyProductFlow } from "../src/domain/product-flow/factory";
import { createManualEdge, createManualNode } from "../src/domain/operations/flowEditing";
import type { ProductFlow } from "../src/domain/product-flow";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../src/mcp/bridge";
import { MINDFLOW_OPERATIONS_REFERENCE } from "../src/mcp/operationsReference";
import { MindFlowMcpToolHandlers } from "../src/mcp/tools";
import { listMcpToolRegistryNames } from "../src/mcp/tools/registry";
import { MINDFLOW_MCP_TOOLS } from "../src/mcp/toolSchemas";
import { emptyFlowSelection, type FlowSelectionPatch, type FlowSelectionState } from "../src/domain/selection";

test("MindFlow MCP tools are operation-only and omit removed generation workflow", () => {
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(createEmptyProductFlow()));
  const tools = handlers.listTools();
  const text = JSON.stringify(tools);
  const removedPhrases = new RegExp(`${["product", "design"].join(" ")}|${["产品", "文档"].join("")}|${["生成", "流程", "图"].join("")}`);

  assert.equal(tools.some((tool) => tool.name === ["mindflow", "apply", "product", "design"].join("_")), false);
  assert.ok(tools.some((tool) => tool.name === "mindflow_get_editor_state"));
  assert.ok(tools.some((tool) => tool.name === "mindflow_batch_upsert_nodes"));
  assert.equal(removedPhrases.test(text), false);
  assert.ok(MINDFLOW_OPERATIONS_REFERENCE.includes("MCP tools never write .mindflow files directly"));
  assert.equal(removedPhrases.test(MINDFLOW_OPERATIONS_REFERENCE), false);
});

test("MindFlow MCP tool schema names match registered handlers", () => {
  const schemaNames = MINDFLOW_MCP_TOOLS.map((tool) => tool.name).sort();
  const registryNames = listMcpToolRegistryNames();

  for (const name of schemaNames) {
    assert.ok(registryNames.includes(name), `${name} must have a registered handler`);
  }
  for (const alias of ["mindflow_get_active_flow", "mindflow_get_open_flows", "mindflow_update_project", "mindflow_upsert_node"]) {
    assert.ok(registryNames.includes(alias), `${alias} compatibility alias must remain registered`);
  }
});

test("MindFlow MCP editor state returns complete selection and hydrated selected entities", async () => {
  const flow = createEmptyProductFlow();
  flow.domains = [{ domainId: "domain_ops", name: "运营", description: "运营域。" }];
  flow.roles = [{ roleId: "role_ops", name: "运营", description: "运营角色。", domainIds: ["domain_ops"] }];
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台。",
    domainIds: ["domain_ops"],
    roleIds: ["role_ops"]
  }];
  flow.statusGroups = [{ statusGroupId: "status_review", title: "审核中", color: "#33aa55" }];
  const node = createManualNode(flow, { title: "工作台", appSurfaceIds: ["app_admin"], domainIds: ["domain_ops"], roleIds: ["role_ops"] });
  const target = createManualNode(flow, { title: "详情页" });
  const edge = createManualEdge(flow, { from: { kind: "node", nodeId: node.nodeId }, to: { kind: "node", nodeId: target.nodeId }, type: "interaction" });
  const bridge = new FakeBridge(flow, {
    selectedProjectOverview: true,
    selectedNodeId: node.nodeId,
    selectedNodeIds: [node.nodeId, "missing_node"],
    selectedEdgeId: edge.edgeId,
    selectedAppSurfaceId: "app_admin",
    selectedDomainId: "domain_ops",
    selectedRoleId: "role_ops",
    selectedStatusGroupId: "status_review"
  });
  const handlers = new MindFlowMcpToolHandlers(bridge);

  const state = await handlers.callTool("mindflow_get_editor_state", {});
  const selection = state.selection as FlowSelectionState;
  const hydrated = state.hydratedSelection as Record<string, unknown>;
  const issues = state.selectionIssues as Array<Record<string, string>>;

  assert.equal(selection.selectedProjectOverview, true);
  assert.equal(selection.selectedNodeId, node.nodeId);
  assert.deepEqual(selection.selectedNodeIds, [node.nodeId, "missing_node"]);
  assert.equal(selection.selectedEdgeId, edge.edgeId);
  assert.ok(hydrated.selectedRoot);
  assert.equal((hydrated.selectedNode as { nodeId?: string }).nodeId, node.nodeId);
  assert.equal((hydrated.selectedEdge as { edgeId?: string }).edgeId, edge.edgeId);
  assert.ok(Array.isArray(hydrated.selectedNodes));
  assert.ok(issues.some((issue) => issue.field === "selectedNodeIds" && issue.id === "missing_node"));
  assert.ok((state.schema as Record<string, unknown>).edgeTypes);
  assert.ok((state.capabilities as Record<string, unknown>).supportsBatchNodeOperations);
});

test("MindFlow MCP can set and clear complete selection state", async () => {
  const flow = createEmptyProductFlow();
  const node = createManualNode(flow, { title: "工作台" });
  const edge = createManualEdge(flow, { from: { kind: "node", nodeId: node.nodeId }, to: { kind: "node", nodeId: node.nodeId }, type: "interaction" });
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(flow));

  const selected = await handlers.callTool("mindflow_set_selection", {
    selectedProjectOverview: false,
    selectedNodeId: node.nodeId,
    selectedNodeIds: [node.nodeId],
    selectedEdgeId: edge.edgeId,
    selectedAppSurfaceId: "missing_app",
    selectedDomainId: "missing_domain",
    selectedRoleId: "missing_role",
    selectedStatusGroupId: "missing_status"
  });
  const selection = selected.selection as FlowSelectionState;
  assert.equal(selection.selectedNodeId, node.nodeId);
  assert.equal(selection.selectedEdgeId, edge.edgeId);
  assert.ok((selected.selectionIssues as Array<Record<string, string>>).some((issue) => issue.field === "selectedAppSurfaceId"));

  const cleared = await handlers.callTool("mindflow_clear_selection", {});
  assert.deepEqual(cleared.selection, emptyFlowSelection());
});

test("MindFlow MCP covers root, app surface, taxonomy, typed nodes, and edges", async () => {
  const bridge = new FakeBridge(createEmptyProductFlow());
  const handlers = new MindFlowMcpToolHandlers(bridge);

  await handlers.callTool("mindflow_update_root", { title: "运营平台", summary: "本地编辑器。", goal: "支持手动建模。" });
  await handlers.callTool("mindflow_move_root", { x: -700.2, y: 24.8 });
  await handlers.callTool("mindflow_upsert_domain", { domainId: "domain_ops", name: "运营", description: "运营域。" });
  await handlers.callTool("mindflow_upsert_role", { roleId: "role_ops", name: "运营", description: "运营角色。", domainIds: ["domain_ops"] });
  await handlers.callTool("mindflow_upsert_app_surface", {
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "后台。",
    domainIds: ["domain_ops"],
    roleIds: ["role_ops"]
  });
  await handlers.callTool("mindflow_move_app_surface", { appId: "app_admin", x: -360, y: 120 });
  await handlers.callTool("mindflow_upsert_status_group", { statusGroupId: "status_review", title: "审核中", color: "#33aa55" });

  const layout = await handlers.callTool("mindflow_upsert_layout_node", nodeInput("应用骨架"));
  const navigation = await handlers.callTool("mindflow_upsert_navigation_node", nodeInput("主导航"));
  const page = await handlers.callTool("mindflow_upsert_page_node", nodeInput("工作台"));
  const popup = await handlers.callTool("mindflow_upsert_popup_node", nodeInput("确认弹窗"));
  const component = await handlers.callTool("mindflow_upsert_component_node", nodeInput("筛选组件"));
  const layoutNode = resultNode(layout);
  const navNode = resultNode(navigation);
  const pageNode = resultNode(page);
  const popupNode = resultNode(popup);
  const componentNode = resultNode(component);

  assert.equal(layoutNode.pageType, "skeleton");
  assert.equal(navNode.pageType, "navigation");
  assert.equal(pageNode.pageType, "page");
  assert.equal(popupNode.pageType, "popup");
  assert.equal(componentNode.pageType, "component");

  await handlers.callTool("mindflow_update_node", { nodeId: pageNode.nodeId, title: "运营工作台", statusGroupId: "status_review" });
  await handlers.callTool("mindflow_move_node", { nodeId: pageNode.nodeId, x: 420.4, y: 160.6 });
  const edge = await handlers.callTool("mindflow_upsert_edge", {
    from: { kind: "node", nodeId: layoutNode.nodeId },
    to: { kind: "node", nodeId: navNode.nodeId },
    trigger: "骨架包含导航",
    type: "nestedRelation"
  });
  const edgeId = ((edge.result as Record<string, unknown>).edge as { edgeId: string }).edgeId;
  await handlers.callTool("mindflow_remove_edge", { edgeId });
  await handlers.callTool("mindflow_remove_node", { nodeId: popupNode.nodeId });

  assert.equal(bridge.flow.title, "运营平台");
  assert.deepEqual(bridge.flow.projectOverview.view?.position, { x: -700, y: 25 });
  assert.deepEqual(bridge.flow.appSurfaces?.[0]?.view?.position, { x: -360, y: 120 });
  assert.equal(bridge.flow.nodes.find((node) => node.nodeId === pageNode.nodeId)?.title, "运营工作台");
  assert.equal(bridge.flow.nodes.find((node) => node.nodeId === pageNode.nodeId)?.view?.position?.x, 420);
  assert.equal(bridge.flow.nodes.find((node) => node.nodeId === popupNode.nodeId)?.status, "removed");
});

test("MindFlow MCP batch node operations are atomic and support dry-run", async () => {
  const bridge = new FakeBridge(createEmptyProductFlow());
  const handlers = new MindFlowMcpToolHandlers(bridge);

  const dryRun = await handlers.callTool("mindflow_batch_upsert_nodes", {
    dryRun: true,
    nodes: [
      { kind: "layout", title: "预检骨架" },
      { kind: "page", title: "预检页面" }
    ]
  });
  assert.equal(dryRun.applied, false);
  assert.equal(bridge.flow.nodes.length, 0);
  assert.equal(((dryRun.result as Record<string, unknown>).nodes as unknown[]).length, 2);

  const upserted = await handlers.callTool("mindflow_batch_upsert_nodes", {
    nodes: [
      { kind: "layout", title: "应用骨架" },
      { kind: "navigation", title: "主导航" },
      { kind: "page", title: "工作台" }
    ]
  });
  assert.equal(upserted.applied, true);
  const nodes = (upserted.result as Record<string, unknown>).nodes as Array<{ nodeId: string; title: string }>;
  assert.equal(nodes.length, 3);
  const [firstNode, secondNode, thirdNode] = nodes;
  assert.ok(firstNode);
  assert.ok(secondNode);
  assert.ok(thirdNode);
  assert.deepEqual(bridge.selection.selectedNodeIds, nodes.map((node) => node.nodeId));

  const selected = await handlers.callTool("mindflow_batch_get_nodes", { selection: true, includeIncidentEdges: true });
  assert.equal((selected.nodes as unknown[]).length, 3);
  assert.ok(Array.isArray(selected.edges));

  const failed = await handlers.callTool("mindflow_batch_update_nodes", {
    nodes: [
      { nodeId: firstNode.nodeId, title: "不应写入" },
      { nodeId: "missing_node", title: "缺失节点" }
    ]
  });
  assert.equal(failed.applied, false);
  assert.ok((failed.issues as string[]).some((issue) => issue.includes("Missing node")));
  assert.equal(bridge.flow.nodes.find((node) => node.nodeId === firstNode.nodeId)?.title, "应用骨架");

  await handlers.callTool("mindflow_batch_move_nodes", {
    nodes: nodes.map((node, index) => ({ nodeId: node.nodeId, x: index * 100, y: index * 50 }))
  });
  assert.deepEqual(bridge.flow.nodes.find((node) => node.nodeId === secondNode.nodeId)?.view?.position, { x: 100, y: 50 });

  const removed = await handlers.callTool("mindflow_batch_remove_nodes", {
    nodes: [{ nodeId: secondNode.nodeId }, { nodeId: thirdNode.nodeId }]
  });
  assert.equal(removed.applied, true);
  assert.deepEqual((removed.result as Record<string, unknown>).removedNodeIds, [secondNode.nodeId, thirdNode.nodeId]);
  assert.equal(bridge.flow.nodes.find((node) => node.nodeId === thirdNode.nodeId)?.status, "removed");
});

class FakeBridge implements MindFlowEditorBridge {
  public applyCount = 0;
  public selection: FlowSelectionState;

  public constructor(public flow: ProductFlow, selection: FlowSelectionPatch = {}) {
    this.selection = { ...emptyFlowSelection(), ...selection };
  }

  public async getOpenEditors(): Promise<MindFlowEditorSnapshot[]> {
    return [this.snapshot(true)];
  }

  public async getActiveEditor(): Promise<MindFlowEditorSnapshot> {
    return this.snapshot(true);
  }

  public async setSelection(_flowUri: string, selection: FlowSelectionPatch): Promise<MindFlowEditorSnapshot> {
    this.selection = { ...emptyFlowSelection(), ...selection };
    return this.snapshot(true);
  }

  public async applyFlowEdit(_flowUri: string, flow: ProductFlow, selection?: FlowSelectionPatch): Promise<MindFlowEditorSnapshot> {
    this.applyCount += 1;
    this.flow = flow;
    if (selection) {
      this.selection = { ...emptyFlowSelection(), ...selection };
    }
    return this.snapshot(true);
  }

  private snapshot(active: boolean): MindFlowEditorSnapshot {
    return {
      uri: "file:///workspace/test.mindflow",
      path: "/workspace/test.mindflow",
      displayName: "test.mindflow",
      active,
      dirty: this.applyCount > 0,
      flow: this.flow,
      selection: this.selection
    };
  }
}

function nodeInput(title: string): Record<string, unknown> {
  return {
    title,
    purpose: `${title}用途。`,
    appSurfaceIds: ["app_admin"],
    domainIds: ["domain_ops"],
    roleIds: ["role_ops"],
    featureGroups: []
  };
}

function resultNode(result: Record<string, unknown>): { nodeId: string; pageType: string } {
  return (result.result as Record<string, unknown>).node as { nodeId: string; pageType: string };
}
