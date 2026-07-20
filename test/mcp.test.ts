import { strict as assert } from "node:assert";
import test from "node:test";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { createFlowEdge, createFlowNode } from "../src/product-flow/domain/editing/graph";
import { EDGE_TYPES, validateProductFlow, type ProductFlow } from "../src/product-flow/domain";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../src/platform/mcp/protocol/bridge";
import { MINDFLOW_OPERATIONS_REFERENCE } from "../src/platform/mcp/protocol/operationsReference";
import { MindFlowMcpToolHandlers } from "../src/platform/mcp/tools";
import { listMcpToolRegistryNames } from "../src/platform/mcp/tools/registry";
import { MINDFLOW_MCP_TOOLS } from "../src/platform/mcp/protocol/toolSchemas";
import { emptyFlowSelection, type FlowSelectionPatch, type FlowSelectionState } from "../src/product-flow/domain/selection";

test("MindFlow MCP tools are operation-only and omit removed generation workflow", () => {
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(createEmptyProductFlow()));
  const tools = handlers.listTools();
  const text = JSON.stringify(tools);
  const removedPhrases = new RegExp(`${["product", "design"].join(" ")}|${["产品", "文档"].join("")}|${["生成", "流程", "图"].join("")}`);

  assert.equal(tools.some((tool) => tool.name === ["mindflow", "apply", "product", "design"].join("_")), false);
  assert.ok(tools.some((tool) => tool.name === "mindflow_get_editor_state"));
  assert.ok(tools.some((tool) => tool.name === "mindflow_batch_upsert_nodes"));
  assert.equal(removedPhrases.test(text), false);
  assert.ok(MINDFLOW_OPERATIONS_REFERENCE.includes("never writes .mindflow files directly"));
  assert.equal(removedPhrases.test(MINDFLOW_OPERATIONS_REFERENCE), false);
});

test("MindFlow MCP tool schema names match registered handlers", () => {
  const schemaNames = MINDFLOW_MCP_TOOLS.map((tool) => tool.name).sort();
  const registryNames = listMcpToolRegistryNames();

  for (const name of schemaNames) {
    assert.ok(registryNames.includes(name), `${name} must have a registered handler`);
  }
  assert.equal(registryNames.includes("mindflow_get_active_flow"), false);
  assert.equal(registryNames.includes("mindflow_get_open_flows"), false);
  assert.equal(registryNames.includes("mindflow_update_project"), false);
});

test("MindFlow MCP rejects arguments that do not match the advertised schema", async () => {
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(createEmptyProductFlow()));

  await assert.rejects(
    () => handlers.callTool("mindflow_move_node", { nodeId: "node_1", x: Number.NaN, y: 10 }),
    /finite number/
  );
  await assert.rejects(
    () => handlers.callTool("mindflow_remove_node", { unexpected: "node_1" }),
    /not allowed/
  );
  await assert.rejects(
    () => handlers.callTool("mindflow_upsert_edge", {
      from: { kind: "mystery", nodeId: "node_1" },
      to: { kind: "node", nodeId: "node_2" }
    }),
    /oneOf schema/
  );
  await assert.rejects(
    () => handlers.callTool("mindflow_batch_move_nodes", { nodes: [] }),
    /at least 1/
  );
  await assert.rejects(
    () => handlers.callTool("mindflow_apply_canvas_changes", { expectedRevision: 1.5, dryRun: true, operations: [{ op: "root.update" }] }),
    /must be an integer/
  );
  await assert.rejects(
    () => handlers.callTool("mindflow_apply_canvas_changes", { expectedRevision: 0, dryRun: true, operations: [{ op: "root.update" }] }),
    /must be at least 1/
  );
  await assert.rejects(
    () => handlers.callTool("mindflow_apply_canvas_changes", {
      expectedRevision: 1,
      dryRun: true,
      operations: Array.from({ length: 201 }, () => ({ op: "root.update" }))
    }),
    /at most 200/
  );

  const changeset = MINDFLOW_MCP_TOOLS.find((tool) => tool.name === "mindflow_apply_canvas_changes");
  assert.equal(changeset?.annotations?.destructiveHint, true);
});

test("MindFlow MCP editor state is compact and returns complete selection", async () => {
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
  const node = createFlowNode(flow, { title: "工作台", appSurfaceIds: ["app_admin"], domainIds: ["domain_ops"], roleIds: ["role_ops"] });
  const target = createFlowNode(flow, { title: "详情页" });
  const edge = createFlowEdge(flow, { from: { kind: "node", nodeId: node.nodeId }, to: { kind: "node", nodeId: target.nodeId }, type: "interaction" });
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
  assert.equal(selection.selectedProjectOverview, true);
  assert.equal(selection.selectedNodeId, node.nodeId);
  assert.deepEqual(selection.selectedNodeIds, [node.nodeId, "missing_node"]);
  assert.equal(selection.selectedEdgeId, edge.edgeId);
  assert.equal("flow" in state, false);
  assert.equal("hydratedSelection" in state, false);
  assert.equal("selectionIssues" in state, false);
  assert.ok((state.schema as Record<string, unknown>).edgeTypes);
  assert.ok((state.capabilities as Record<string, unknown>).supportsBatchNodeOperations);
});

test("MindFlow MCP queries entities with pagination while leaving authoring policy to skills", async () => {
  const flow = createEmptyProductFlow();
  createFlowNode(flow, { title: "A", pageType: "page" });
  createFlowNode(flow, { title: "B", pageType: "component" });
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(flow));

  const first = await handlers.callTool("mindflow_query_entities", { entityKind: "node", limit: 1 });
  assert.equal((first.items as unknown[]).length, 1);
  assert.equal((first.page as { total: number; nextCursor?: string }).total, 2);
  const second = await handlers.callTool("mindflow_query_entities", {
    entityKind: "node",
    limit: 1,
    cursor: (first.page as { nextCursor: string }).nextCursor
  });
  assert.equal((second.items as unknown[]).length, 1);

  await handlers.callTool("mindflow_upsert_edge", {
    from: { kind: "node", nodeId: flow.nodes[0]!.nodeId },
    to: { kind: "node", nodeId: flow.nodes[1]!.nodeId },
    type: "interaction",
    cardOutletReason: "whole-node event"
  });
  await handlers.callTool("mindflow_upsert_node", {
    title: "缺少语义功能的页面",
    pageType: "page"
  });
  await assert.rejects(() => handlers.callTool("mindflow_upsert_edge", {
    from: { kind: "featureItem", nodeId: flow.nodes[0]!.nodeId, groupId: "missing", itemId: "missing" },
    to: { kind: "node", nodeId: flow.nodes[1]!.nodeId }
  }), /type is required/);
});

test("MindFlow MCP changesets resolve nested local refs, dry-run, and commit atomically", async () => {
  const bridge = new FakeBridge(createEmptyProductFlow());
  const handlers = new MindFlowMcpToolHandlers(bridge);
  const operations = [
    { op: "taxonomy.upsert", kind: "statusGroup", localRef: "review-status", title: "审核状态", color: "#33aa55" },
    {
      op: "node.upsert", localRef: "pending-node", title: "订单 · 待审核", pageType: "page", statusGroupId: "review-status",
      featureGroups: [{ localRef: "review-group", name: "审核操作", type: "section", description: "审核动作。", items: [{ localRef: "approve-item", name: "通过", type: "button", description: "通过审核。" }] }]
    },
    {
      op: "node.upsert", localRef: "approved-node", title: "订单 · 已通过", pageType: "page", statusGroupId: "review-status",
      featureGroups: [{ localRef: "approved-group", name: "状态摘要", items: [{ localRef: "approved-item", name: "已通过", type: "status", description: "订单审核已通过。" }] }]
    },
    {
      op: "edge.upsert",
      localRef: "pending-entry",
      from: { kind: "projectOverview" },
      to: { kind: "node", nodeRef: "pending-node" },
      type: "nestedRelation",
      trigger: "进入待审核状态"
    },
    {
      op: "edge.upsert",
      localRef: "approve-edge",
      from: { kind: "featureItem", nodeRef: "pending-node", groupRef: "review-group", itemRef: "approve-item" },
      to: { kind: "node", nodeRef: "approved-node" },
      type: "statusChange", trigger: "审核通过"
    }
  ];

  const dryRun = await handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: 1, dryRun: true, operations
  });
  assert.equal(dryRun.applied, false);
  assert.deepEqual(dryRun.errors ?? [], []);
  assert.equal(bridge.applyCount, 0);
  assert.equal((dryRun.summary as { nodes: number }).nodes, 2);
  assert.equal((dryRun.idMap as Record<string, Record<string, string>>).featureItems?.["approve-item"]?.startsWith("item_"), true);
  assert.equal((dryRun.idMap as Record<string, Record<string, string>>).edges?.["approve-edge"]?.startsWith("edge_"), true);
  const createdIds = (dryRun.changeSummary as { createdIds: string[] }).createdIds;
  assert.ok(createdIds.includes((dryRun.idMap as Record<string, Record<string, string>>).statusGroups!["review-status"]!));
  assert.ok(createdIds.includes((dryRun.idMap as Record<string, Record<string, string>>).nodes!["pending-node"]!));
  assert.ok(createdIds.includes((dryRun.idMap as Record<string, Record<string, string>>).edges!["approve-edge"]!));

  const committed = await handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: 1, dryRun: false, operations
  });
  assert.equal(committed.applied, true);
  assert.equal(bridge.applyCount, 1);
  assert.equal(bridge.flow.nodes.length, 2);
  const statusEdge = bridge.flow.edges.find((edge) => edge.type === "statusChange");
  assert.equal(statusEdge?.type, "statusChange");
  assert.equal(statusEdge?.from.kind, "featureItem");
  assert.equal(statusEdge?.edgeId, (committed.idMap as Record<string, Record<string, string>>).edges!["approve-edge"]);

  const conflict = handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: 1, dryRun: true, operations: [{ op: "root.update", title: "冲突" }]
  });
  await assert.rejects(() => conflict, /revision conflict/);
});

test("MindFlow MCP changeset accepts structurally valid card outlets without applying a dry-run", async () => {
  const flow = createEmptyProductFlow();
  const first = createFlowNode(flow, { title: "来源", pageType: "page" });
  const second = createFlowNode(flow, { title: "目标", pageType: "page" });
  const bridge = new FakeBridge(flow);
  const handlers = new MindFlowMcpToolHandlers(bridge);

  const result = await handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: flow.revision,
    dryRun: true,
    operations: [{ op: "edge.upsert", from: { kind: "node", nodeRef: first.nodeId }, to: { kind: "node", nodeRef: second.nodeId }, type: "interaction" }]
  });
  assert.equal(result.applied, false);
  assert.deepEqual(result.errors ?? [], []);
  assert.equal((result.validation as { valid: boolean }).valid, true);
  assert.equal(bridge.applyCount, 0);
  assert.equal(bridge.flow.edges.length, 0);
});

test("MindFlow MCP leaves application entry methodology to external skills", async () => {
  const flow = createEmptyProductFlow();
  flow.appSurfaces = [{
    appId: "app_admin",
    name: "管理后台",
    type: "admin",
    description: "采购管理后台。",
    domainIds: [],
    roleIds: []
  }];
  const page = createFlowNode(flow, {
    title: "采购工作台",
    pageType: "page",
    appSurfaceIds: ["app_admin"],
    featureGroups: [{
      groupId: "group_workbench",
      name: "工作台内容",
      type: "section",
      description: "采购工作台的业务入口。",
      items: [{ itemId: "item_plan", name: "采购计划", type: "link", description: "进入采购计划。" }]
    }]
  });
  const bridge = new FakeBridge(flow);
  const handlers = new MindFlowMcpToolHandlers(bridge);

  const result = await handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: flow.revision,
    dryRun: true,
    operations: [{
      op: "edge.upsert",
      from: { kind: "appSurface", appRef: "app_admin" },
      to: { kind: "node", nodeRef: page.nodeId },
      type: "nestedRelation"
    }]
  });

  assert.equal(result.applied, false);
  assert.deepEqual(result.errors ?? [], []);
  assert.equal((result.validation as { valid: boolean }).valid, true);
  assert.equal(bridge.applyCount, 0);
  assert.equal(bridge.flow.edges.length, 0);
});

test("MindFlow MCP validates the same structural contract as manual editing", async () => {
  const flow = createEmptyProductFlow();
  createFlowNode(flow, {
    title: "未连接页面",
    pageType: "page",
    featureGroups: [{
      groupId: "group_orphan",
      name: "页面内容",
      type: "section",
      description: "待连接内容。",
      items: [{ itemId: "item_orphan", name: "查看内容", type: "link", description: "查看。" }]
    }]
  });
  assert.equal(validateProductFlow(flow).valid, true);
  const bridge = new FakeBridge(flow);
  const handlers = new MindFlowMcpToolHandlers(bridge);

  const validation = await handlers.callTool("mindflow_validate_flow", {});
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);

  const dryRun = await handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: flow.revision,
    dryRun: true,
    operations: [{
      op: "node.upsert",
      localRef: "second-orphan",
      title: "第二个未连接页面",
      pageType: "page",
      featureGroups: [{ localRef: "group-second", name: "内容", items: [{ localRef: "item-second", name: "查看", type: "link" }] }]
    }]
  });
  assert.equal(dryRun.applied, false);
  assert.deepEqual(dryRun.errors ?? [], []);
  assert.equal((dryRun.validation as { valid: boolean }).valid, true);
  assert.equal(bridge.applyCount, 0);
});

test("MindFlow MCP accepts alternate navigation models for skill-level review", async () => {
  const flow = createEmptyProductFlow();
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(flow));
  const operations = [
    {
      op: "node.upsert", localRef: "shell", title: "应用骨架", pageType: "skeleton",
      featureGroups: [{ localRef: "shell-layout", name: "布局区域", items: [
        { localRef: "shell-nav", name: "主导航", type: "link" },
        { localRef: "shell-topbar", name: "顶栏", type: "text" },
        { localRef: "shell-child-nav", name: "子导航占位", type: "link" }
      ] }]
    },
    {
      op: "node.upsert", localRef: "main-nav", title: "主导航", pageType: "navigation",
      featureGroups: [{ localRef: "main-nav-items", name: "导航项", items: [{ localRef: "open-child", name: "业务分类", type: "link" }] }]
    },
    {
      op: "node.upsert", localRef: "child-nav", title: "业务子导航", pageType: "navigation",
      featureGroups: [{ localRef: "child-nav-items", name: "导航项", items: [{ localRef: "child-page", name: "业务列表", type: "link" }] }]
    },
    {
      op: "node.upsert", localRef: "topbar", title: "应用顶栏", pageType: "component",
      featureGroups: [{ localRef: "topbar-content", name: "顶栏内容", items: [{ localRef: "brand", name: "产品标题", type: "text" }] }]
    },
    { op: "edge.upsert", localRef: "shell-entry", from: { kind: "projectOverview" }, to: { kind: "node", nodeRef: "shell" }, type: "nestedRelation" },
    { op: "edge.upsert", localRef: "main-nav-entry", from: { kind: "featureItem", nodeRef: "shell", groupRef: "shell-layout", itemRef: "shell-nav" }, to: { kind: "node", nodeRef: "main-nav" }, type: "nestedRelation" },
    { op: "edge.upsert", localRef: "topbar-entry", from: { kind: "featureItem", nodeRef: "shell", groupRef: "shell-layout", itemRef: "shell-topbar" }, to: { kind: "node", nodeRef: "topbar" }, type: "nestedRelation" },
    { op: "edge.upsert", localRef: "child-nav-entry", from: { kind: "featureItem", nodeRef: "main-nav", groupRef: "main-nav-items", itemRef: "open-child" }, to: { kind: "node", nodeRef: "child-nav" }, type: "interaction" }
  ];

  const valid = await handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: flow.revision, dryRun: true, operations
  });
  assert.deepEqual(valid.errors ?? [], []);

  const invalid = await handlers.callTool("mindflow_apply_canvas_changes", {
    expectedRevision: flow.revision,
    dryRun: true,
    operations: [...operations, {
      op: "edge.upsert", localRef: "duplicate-child-entry",
      from: { kind: "featureItem", nodeRef: "shell", groupRef: "shell-layout", itemRef: "shell-child-nav" },
      to: { kind: "node", nodeRef: "child-nav" }, type: "nestedRelation"
    }]
  });
  assert.equal(invalid.applied, false);
  assert.deepEqual(invalid.errors ?? [], []);
  assert.equal((invalid.validation as { valid: boolean }).valid, true);
});

test("MindFlow MCP can set and clear complete selection state", async () => {
  const flow = createEmptyProductFlow();
  const node = createFlowNode(flow, { title: "工作台" });
  const edge = createFlowEdge(flow, { from: { kind: "node", nodeId: node.nodeId }, to: { kind: "node", nodeId: node.nodeId }, type: "interaction" });
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

test("MindFlow MCP edit responses are compact unless the caller requests the full flow", async () => {
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(createEmptyProductFlow()));
  const compact = await handlers.callTool("mindflow_update_root", { title: "Compact" });
  const expanded = await handlers.callTool("mindflow_update_root", { title: "Expanded", includeFlow: true });

  assert.equal("flow" in compact, false);
  assert.ok(compact.change);
  assert.ok(expanded.flow);
});

test("MindFlow MCP covers root, app surface, taxonomy, generic nodes, and edges", async () => {
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

  const layout = await handlers.callTool("mindflow_upsert_node", nodeInput("应用骨架", "skeleton"));
  const navigation = await handlers.callTool("mindflow_upsert_node", nodeInput("主导航", "navigation"));
  const page = await handlers.callTool("mindflow_upsert_node", nodeInput("工作台", "page"));
  const popup = await handlers.callTool("mindflow_upsert_node", nodeInput("确认弹窗", "popup"));
  const component = await handlers.callTool("mindflow_upsert_node", nodeInput("筛选组件", "component"));
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
  const layoutFeature = bridge.flow.nodes.find((node) => node.nodeId === layoutNode.nodeId)!.featureGroups[0]!.items[0]!;
  const layoutGroup = bridge.flow.nodes.find((node) => node.nodeId === layoutNode.nodeId)!.featureGroups[0]!;
  const edge = await handlers.callTool("mindflow_upsert_edge", {
    from: { kind: "featureItem", nodeId: layoutNode.nodeId, groupId: layoutGroup.groupId, itemId: layoutFeature.itemId },
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

test("MindFlow MCP duplicates nodes and partially updates edges with manual-equivalent operations", async () => {
  const flow = createEmptyProductFlow();
  const source = createFlowNode(flow, { title: "来源", pageType: "page", x: 10, y: 20 });
  const target = createFlowNode(flow, { title: "目标", pageType: "page", x: 300, y: 200 });
  const edge = createFlowEdge(flow, { from: { kind: "node", nodeId: source.nodeId }, to: { kind: "node", nodeId: target.nodeId }, type: "interaction", trigger: "打开" });
  const bridge = new FakeBridge(flow);
  const handlers = new MindFlowMcpToolHandlers(bridge);

  await handlers.callTool("mindflow_update_edge", { edgeId: edge.edgeId, condition: "具有权限" });
  assert.equal(bridge.flow.edges.find((item) => item.edgeId === edge.edgeId)?.condition, "具有权限");

  const duplicated = await handlers.callTool("mindflow_duplicate_nodes", {
    nodeIds: [source.nodeId, target.nodeId], primaryNodeId: target.nodeId, x: 800, y: 500
  });
  const copied = (duplicated.result as Record<string, unknown>).nodes as Array<{ nodeId: string; title: string; view?: { position?: { x: number; y: number } } }>;
  assert.equal(copied.length, 2);
  assert.deepEqual(copied.map((node) => node.title), ["来源 副本", "目标 副本"]);
  assert.deepEqual(copied.map((node) => node.view?.position), [{ x: 800, y: 500 }, { x: 1090, y: 680 }]);
  assert.equal(bridge.selection.selectedNodeId, copied[1]!.nodeId);
  await assert.rejects(() => handlers.callTool("mindflow_duplicate_nodes", {
    nodeIds: [source.nodeId], primaryNodeId: target.nodeId, x: 0, y: 0
  }), /primaryNodeId must be included/);
});

test("MindFlow MCP reads revision-pinned subgraphs and traces directed paths", async () => {
  const flow = createEmptyProductFlow();
  const first = createFlowNode(flow, { title: "A", pageType: "page" });
  const second = createFlowNode(flow, { title: "B", pageType: "page" });
  const third = createFlowNode(flow, { title: "C", pageType: "page" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: first.nodeId }, to: { kind: "node", nodeId: second.nodeId }, type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: second.nodeId }, to: { kind: "node", nodeId: third.nodeId }, type: "autoNavigate" });
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(flow));

  const subgraph = await handlers.callTool("mindflow_get_subgraph", { expectedRevision: flow.revision, nodeIds: [first.nodeId], direction: "outgoing", depth: 1 });
  assert.deepEqual((subgraph.nodes as Array<{ nodeId: string }>).map((node) => node.nodeId), [first.nodeId, second.nodeId]);
  assert.equal((subgraph.edges as unknown[]).length, 1);
  assert.deepEqual(subgraph.boundaryNodeIds, [second.nodeId]);
  const traced = await handlers.callTool("mindflow_trace_paths", { expectedRevision: flow.revision, fromId: first.nodeId, toId: third.nodeId });
  assert.deepEqual((traced.paths as Array<{ nodeIds: string[] }>)[0]?.nodeIds, [first.nodeId, second.nodeId, third.nodeId]);
  await assert.rejects(() => handlers.callTool("mindflow_get_subgraph", { expectedRevision: flow.revision - 1, nodeIds: [first.nodeId] }), /revision conflict/);
  await assert.rejects(() => handlers.callTool("mindflow_get_subgraph", { expectedRevision: flow.revision, nodeIds: ["missing"] }), /unknown ids/);
});

test("MindFlow MCP previews/applies DOM layout and reveals cards without changing selection", async () => {
  const flow = createEmptyProductFlow();
  const node = createFlowNode(flow, { title: "页面", pageType: "page", x: 10, y: 20 });
  const bridge = new FakeBridge(flow);
  const handlers = new MindFlowMcpToolHandlers(bridge);
  const preview = await handlers.callTool("mindflow_preview_auto_layout", { expectedRevision: flow.revision });
  assert.deepEqual((preview.layout as { nodePositions: Record<string, unknown> }).nodePositions[node.nodeId], { x: 640, y: 160 });
  const applied = await handlers.callTool("mindflow_apply_auto_layout", { expectedRevision: flow.revision, dryRun: false });
  assert.equal(applied.applied, true);
  assert.deepEqual(bridge.flow.nodes.find((item) => item.nodeId === node.nodeId)?.view?.position, { x: 640, y: 160 });
  const selectionBefore = { ...bridge.selection };
  await handlers.callTool("mindflow_reveal_entities", { targets: [{ kind: "node", id: node.nodeId }] });
  assert.deepEqual(bridge.revealed, [{ kind: "node", id: node.nodeId }]);
  assert.deepEqual(bridge.selection, selectionBefore);
  await assert.rejects(() => handlers.callTool("mindflow_reveal_entities", {
    targets: [{ kind: "node", id: "missing" }]
  }), /Cannot reveal unknown active node/);
});

test("MindFlow MCP batch node operations are atomic and support dry-run", async () => {
  const bridge = new FakeBridge(createEmptyProductFlow());
  const handlers = new MindFlowMcpToolHandlers(bridge);

  const dryRun = await handlers.callTool("mindflow_batch_upsert_nodes", {
    dryRun: true,
    nodes: [
      nodeInput("预检骨架", "skeleton"),
      nodeInput("预检页面", "page")
    ]
  });
  assert.equal(dryRun.applied, false);
  assert.equal(bridge.flow.nodes.length, 0);
  assert.equal(((dryRun.result as Record<string, unknown>).nodes as unknown[]).length, 2);

  const upserted = await handlers.callTool("mindflow_batch_upsert_nodes", {
    nodes: [
      nodeInput("应用骨架", "skeleton"),
      nodeInput("主导航", "navigation"),
      nodeInput("工作台", "page")
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
  public revealed: Array<{ kind: "projectOverview" | "appSurface" | "node"; id: string }> = [];

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

  public async previewAutoLayout() {
    return {
      projectOverviewPosition: { x: 0, y: 0 },
      appSurfacePositions: Object.fromEntries(this.flow.appSurfaces.map((surface, index) => [surface.appId, { x: 320, y: index * 200 }])),
      nodePositions: Object.fromEntries(this.flow.nodes.filter((node) => node.status !== "removed").map((node, index) => [node.nodeId, { x: 640, y: index * 320 + 160 }]))
    };
  }

  public async revealEntities(_flowUri: string, targets: Array<{ kind: "projectOverview" | "appSurface" | "node"; id: string }>): Promise<void> {
    this.revealed = targets;
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

function nodeInput(title: string, pageType: "skeleton" | "navigation" | "page" | "popup" | "component"): Record<string, unknown> {
  return {
    title,
    pageType,
    purpose: `${title}用途。`,
    appSurfaceIds: ["app_admin"],
    domainIds: ["domain_ops"],
    roleIds: ["role_ops"],
    featureGroups: [{
      groupId: `group_${title}`,
      name: pageType === "skeleton" ? "布局区域" : pageType === "navigation" ? "导航项目" : "页面功能",
      type: "section",
      description: `${title}的语义功能。`,
      items: [{ itemId: `item_${title}`, name: pageType === "skeleton" ? "内容区域" : pageType === "navigation" ? "首页" : "主要操作", type: "link", description: `${title}功能项。` }]
    }]
  };
}

function resultNode(result: Record<string, unknown>): { nodeId: string; pageType: string } {
  return (result.result as Record<string, unknown>).node as { nodeId: string; pageType: string };
}
