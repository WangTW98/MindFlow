import { strict as assert } from "node:assert";
import test from "node:test";
import { createEmptyProductFlow } from "../src/core/emptyFlow";
import { createManualNode } from "../src/core/flowEditing";
import type { ProductFlow } from "../src/models/productFlow";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../src/mcp/bridge";
import { MINDFLOW_AUTHORING_GUIDE } from "../src/mcp/authoringGuide";
import { MindFlowMcpToolHandlers } from "../src/mcp/tools";
import { emptyFlowSelection, type FlowSelectionPatch } from "../src/webview/flowSelection";

test("MindFlow MCP authoring guide states hierarchy and editor-only writes", () => {
  assert.ok(MINDFLOW_AUTHORING_GUIDE.includes("应用布局 is the parent layer of 导航"));
  assert.ok(MINDFLOW_AUTHORING_GUIDE.includes("Never write .mindflow files directly"));
});

test("MindFlow MCP product design builds layout before navigation and does not create app nodes", async () => {
  const bridge = new FakeBridge(createEmptyProductFlow());
  const handlers = new MindFlowMcpToolHandlers(bridge);

  await handlers.callTool("mindflow_apply_product_design", {
    project: {
      title: "客服运营平台",
      summary: "面向客服运营的多端产品。",
      goal: "提升工单处理效率。"
    },
    domains: [{ clientId: "opsDomain", name: "客服运营", description: "工单、会话和质检。" }],
    roles: [{ clientId: "agentRole", name: "客服专员", description: "处理工单。", domainIds: ["opsDomain"] }],
    appSurfaces: [{
      clientId: "adminApp",
      name: "运营后台",
      type: "admin",
      description: "客服专员处理工单的后台。",
      domainIds: ["opsDomain"],
      roleIds: ["agentRole"]
    }],
    nodes: [
      {
        clientId: "layout",
        layer: "applicationLayout",
        title: "运营后台应用布局",
        purpose: "定义侧栏、顶栏和主工作区。",
        appSurfaceIds: ["adminApp"],
        domainIds: ["opsDomain"],
        roleIds: ["agentRole"],
        featureGroups: []
      },
      {
        clientId: "nav",
        layer: "navigation",
        layoutClientId: "layout",
        title: "工单导航",
        purpose: "组织工单列表和质检入口。",
        appSurfaceIds: ["adminApp"],
        domainIds: ["opsDomain"],
        roleIds: ["agentRole"],
        featureGroups: []
      },
      {
        clientId: "ticketPage",
        layer: "page",
        navigationClientId: "nav",
        title: "工单列表页",
        purpose: "查看并处理待办工单。",
        appSurfaceIds: ["adminApp"],
        domainIds: ["opsDomain"],
        roleIds: ["agentRole"],
        featureGroups: [{
          groupId: "group_ticket_table",
          name: "工单表格",
          type: "table",
          description: "展示工单列表。",
          items: [{ itemId: "item_filter", name: "筛选器", type: "filter", description: "按状态筛选工单。" }]
        }]
      },
      {
        clientId: "ticketSummary",
        layer: "component",
        parentClientId: "ticketPage",
        title: "工单摘要组件",
        purpose: "展示工单摘要信息。",
        appSurfaceIds: ["adminApp"],
        domainIds: ["opsDomain"],
        roleIds: ["agentRole"],
        featureGroups: []
      }
    ]
  });

  const flow = bridge.flow;
  assert.equal(flow.title, "客服运营平台");
  assert.equal(flow.appSurfaces?.length, 1);
  assert.equal(flow.nodes.some((node) => node.title === "运营后台"), false);
  assert.equal(flow.statusGroups?.length ?? 0, 0);

  const layout = requireNode(flow, "运营后台应用布局");
  const nav = requireNode(flow, "工单导航");
  const page = requireNode(flow, "工单列表页");
  const component = requireNode(flow, "工单摘要组件");
  assert.equal(layout.pageType, "skeleton");
  assert.equal(nav.pageType, "navigation");
  assert.equal(page.pageType, "page");
  assert.equal(component.pageType, "component");
  assertNestedEdge(flow, layout.nodeId, nav.nodeId);
  assertNestedEdge(flow, nav.nodeId, page.nodeId);
  assertNestedEdge(flow, page.nodeId, component.nodeId);
  assert.equal(bridge.applyCount, 1);
});

test("MindFlow MCP edge policy updates same-type duplicate and rejects different-type duplicate", async () => {
  const flow = createEmptyProductFlow();
  const start = createManualNode(flow, { title: "开始页", featureGroups: [] });
  const target = createManualNode(flow, { title: "详情页", featureGroups: [] });
  const handlers = new MindFlowMcpToolHandlers(new FakeBridge(flow));

  const created = await handlers.callTool("mindflow_upsert_edge", {
    from: { kind: "node", nodeId: start.nodeId },
    to: { kind: "node", nodeId: target.nodeId },
    trigger: "点击查看详情",
    type: "interaction"
  });
  const createdEdgeId = (((created.result as Record<string, unknown>).edge as Record<string, unknown>).edgeId);

  const updated = await handlers.callTool("mindflow_upsert_edge", {
    from: { kind: "node", nodeId: start.nodeId },
    to: { kind: "node", nodeId: target.nodeId },
    trigger: "打开详情",
    type: "interaction"
  });
  const updatedResult = updated.result as Record<string, unknown>;
  const updatedEdge = updatedResult.edge as Record<string, unknown>;
  assert.equal(updatedResult.mode, "updatedExisting");
  assert.equal(updatedEdge.edgeId, createdEdgeId);
  assert.equal(updatedEdge.trigger, "打开详情");

  let rejected = false;
  try {
    await handlers.callTool("mindflow_upsert_edge", {
      from: { kind: "node", nodeId: start.nodeId },
      to: { kind: "node", nodeId: target.nodeId },
      trigger: "同步详情数据",
      type: "dataFlow"
    });
  } catch (error) {
    rejected = error instanceof Error && /different edge type/.test(error.message);
  }
  assert.equal(rejected, true);
});

class FakeBridge implements MindFlowEditorBridge {
  public applyCount = 0;

  public constructor(public flow: ProductFlow) {}

  public async getOpenEditors(): Promise<MindFlowEditorSnapshot[]> {
    return [this.snapshot(true)];
  }

  public async getActiveEditor(): Promise<MindFlowEditorSnapshot> {
    return this.snapshot(true);
  }

  public async applyFlowEdit(_flowUri: string, flow: ProductFlow, selection?: FlowSelectionPatch): Promise<MindFlowEditorSnapshot> {
    this.applyCount += 1;
    this.flow = flow;
    return this.snapshot(true, selection);
  }

  private snapshot(active: boolean, selection: FlowSelectionPatch = {}): MindFlowEditorSnapshot {
    return {
      uri: "file:///workspace/test.mindflow",
      path: "/workspace/test.mindflow",
      displayName: "test.mindflow",
      active,
      dirty: this.applyCount > 0,
      flow: this.flow,
      selection: { ...emptyFlowSelection(), ...selection }
    };
  }
}

function requireNode(flow: ProductFlow, title: string) {
  const node = flow.nodes.find((candidate) => candidate.title === title);
  assert.ok(node, `Missing node: ${title}`);
  return node;
}

function assertNestedEdge(flow: ProductFlow, fromNodeId: string, toNodeId: string): void {
  assert.ok(flow.edges.some((edge) =>
    edge.status === "active" &&
    edge.type === "nestedRelation" &&
    edge.from?.nodeId === fromNodeId &&
    edge.to?.nodeId === toNodeId
  ), `Missing nested edge ${fromNodeId} -> ${toNodeId}`);
}
