import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as ts from "typescript";
import type { FeatureGroup, PageNode, ProductFlow } from "../src/product-flow/domain";
import { ensureAppSurfaceEntryEdges } from "../src/product-flow/domain/editing/layout/appSurfaceEntryEdges";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { createFlowEdge, createFlowNode } from "../src/product-flow/domain/editing/graph";

export function createProcurementFlow(options: { includeAppSurfaceEntryEdges?: boolean } = {}): ProductFlow {
  const flow = createEmptyProductFlow("多应用端采购协同平台需求示例");
  flow.projectOverview.summary = "多应用端采购协同平台产品流程。";
  flow.domains = [
    { domainId: "domain_plan", name: "采购计划", description: "需求池、计划新建、计划详情与附件材料。" },
    { domainId: "domain_sourcing", name: "询价比价", description: "询价方案、供应商邀请、报价对比和比价报告。" },
    { domainId: "domain_supplier", name: "供应商投标", description: "门户首页、报价填写、报价撤回和合同确认。" },
    { domainId: "domain_mobile_approval", name: "移动审批", description: "待办列表、审批详情、通过、退回和转交。" },
    { domainId: "domain_contract_archive", name: "合同归档", description: "合同生成、供应商确认、归档详情和履约节点。" },
    { domainId: "domain_public", name: "公开采购公告", description: "公告列表、公告详情和供应商注册。" },
    { domainId: "domain_admin", name: "系统管理", description: "供应商审核、角色权限和黑名单维护。" }
  ];
  flow.roles = [
    { roleId: "role_buyer", name: "采购专员", description: "创建采购计划、发布询价、对比报价、发起审批。", domainIds: ["domain_plan", "domain_sourcing"] },
    { roleId: "role_purchase_manager", name: "采购经理", description: "审批采购方案，查看预算和供应商风险。", domainIds: ["domain_mobile_approval", "domain_sourcing"] },
    { roleId: "role_finance", name: "财务审核员", description: "审核预算占用、付款条款和财务风险。", domainIds: ["domain_mobile_approval", "domain_contract_archive"] },
    { roleId: "role_general_manager", name: "总经理", description: "审批高金额采购。", domainIds: ["domain_mobile_approval"] },
    { roleId: "role_supplier_sales", name: "供应商销售", description: "查看询价、提交报价和撤回报价。", domainIds: ["domain_supplier"] },
    { roleId: "role_supplier_admin", name: "供应商管理员", description: "管理供应商资料、确认合同。", domainIds: ["domain_supplier", "domain_contract_archive"] },
    { roleId: "role_guest_supplier", name: "访客供应商", description: "浏览公开公告并提交注册。", domainIds: ["domain_public"] },
    { roleId: "role_system_admin", name: "系统管理员", description: "审核供应商注册、维护供应商黑名单和权限。", domainIds: ["domain_admin"] }
  ];
  flow.appSurfaces = [
    {
      appId: "app_admin",
      name: "管理后台",
      type: "admin",
      description: "采购专员、采购经理、财务和系统管理员使用的运营后台。",
      domainIds: ["domain_plan", "domain_sourcing", "domain_contract_archive", "domain_admin"],
      roleIds: ["role_buyer", "role_purchase_manager", "role_finance", "role_system_admin"]
    },
    {
      appId: "app_supplier_portal",
      name: "供应商门户",
      type: "web",
      description: "供应商查看询价、提交报价和确认合同的门户。",
      domainIds: ["domain_supplier", "domain_contract_archive"],
      roleIds: ["role_supplier_sales", "role_supplier_admin"]
    },
    {
      appId: "app_mobile_approval",
      name: "移动审批 App",
      type: "app",
      description: "审批人处理采购审批待办的移动应用。",
      domainIds: ["domain_mobile_approval"],
      roleIds: ["role_purchase_manager", "role_finance", "role_general_manager"]
    },
    {
      appId: "app_public_site",
      name: "公开采购网站",
      type: "web",
      description: "访客供应商浏览采购公告并提交注册的公开站点。",
      domainIds: ["domain_public"],
      roleIds: ["role_guest_supplier"]
    }
  ];

  addNode(flow, "管理后台骨架", "skeleton", ["app_admin"], ["domain_plan", "domain_sourcing", "domain_contract_archive", "domain_admin"], ["role_buyer", "role_purchase_manager", "role_finance", "role_system_admin"], "承载管理后台顶栏、导航和内容区域。", [
    ["左侧主导航", "navigation", "连接管理后台主导航。"],
    ["内容区域", "content", "承载后台业务页面。"]
  ]);
  addNode(flow, "供应商门户骨架", "skeleton", ["app_supplier_portal"], ["domain_supplier", "domain_contract_archive"], ["role_supplier_sales", "role_supplier_admin"], "承载供应商门户品牌栏、任务导航和正文。", [
    ["任务导航", "navigation", "连接供应商任务导航。"],
    ["正文区域", "content", "承载供应商业务页面。"]
  ]);
  addNode(flow, "移动审批骨架", "skeleton", ["app_mobile_approval"], ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"], "承载移动审批顶栏、内容和底部导航。", [
    ["底部导航", "navigation", "连接移动底部导航。"],
    ["内容区域", "content", "承载移动审批页面。"]
  ]);
  addNode(flow, "公开网站骨架", "skeleton", ["app_public_site"], ["domain_public"], ["role_guest_supplier"], "承载公开网站页头、导航、正文和页脚。", [
    ["公开导航", "navigation", "连接公开网站导航。"],
    ["正文区域", "content", "承载公开采购页面。"]
  ]);

  const workbenchNode = addNode(flow, "采购工作台", "workspace", ["app_admin"], ["domain_plan", "domain_sourcing"], ["role_buyer"], "采购专员查看需求池、待处理计划、报价和审批状态。", [
    ["需求池列表", "table", "展示待采购需求。"],
    ["新建计划按钮", "button", "进入采购计划新建页。"],
    ["待处理任务", "list", "展示待发布询价和待发起审批事项。"]
  ]);
  const planNode = addNode(flow, "采购计划新建页", "form", ["app_admin"], ["domain_plan"], ["role_buyer"], "录入采购计划基础信息、预算和需求附件。", [
    ["计划编号", "input", "录入或自动生成采购计划编号。"],
    ["采购品类", "select", "选择采购品类。"],
    ["预算金额", "currency", "录入预算金额。"],
    ["提交计划按钮", "button", "提交并进入询价方案编辑。"]
  ]);
  const inquiryNode = addNode(flow, "询价方案编辑页", "form", ["app_admin"], ["domain_sourcing"], ["role_buyer"], "维护供应商筛选条件、询价明细并发布询价。", [
    ["供应商等级", "select", "筛选供应商等级。"],
    ["历史履约评分", "number", "筛选历史评分。"],
    ["发布询价按钮", "button", "发布询价并通知供应商门户。"]
  ]);
  const supplierHomeNode = addNode(flow, "供应商门户首页", "home", ["app_supplier_portal"], ["domain_supplier"], ["role_supplier_sales", "role_supplier_admin"], "供应商查看定向询价、报价状态和合同确认任务。", [
    ["询价任务列表", "table", "展示可报价询价。"],
    ["进入报价按钮", "button", "进入报价填写页。"]
  ]);
  const quoteNode = addNode(flow, "报价填写页", "form", ["app_supplier_portal"], ["domain_supplier"], ["role_supplier_sales"], "供应商填写报价金额、交付周期并上传报价材料。", [
    ["报价金额", "currency", "填写报价金额。"],
    ["资质文件", "upload", "上传资质材料。"],
    ["提交报价按钮", "button", "提交报价到管理后台。"]
  ]);
  const compareNode = addNode(flow, "报价对比页", "workspace", ["app_admin"], ["domain_sourcing"], ["role_buyer"], "采购专员筛选、对比供应商报价并生成比价报告。", [
    ["供应商名称", "input", "按供应商名称筛选。"],
    ["报价结果列表", "table", "展示供应商、报价、税率、交期、评分和风险标签。"],
    ["查询按钮", "button", "查询报价列表。"],
    ["生成比价报告按钮", "button", "生成比价报告。"]
  ]);
  const approvalStartNode = addNode(flow, "审批发起页", "form", ["app_admin"], ["domain_sourcing", "domain_mobile_approval"], ["role_buyer"], "采购专员确认推荐供应商和审批流后发起移动审批。", [
    ["推荐供应商", "select", "选择推荐中标供应商。"],
    ["审批流选择", "select", "选择采购经理、财务审核员和总经理。"],
    ["发起审批按钮", "button", "发送审批待办到移动审批 App。"]
  ]);
  const mobileTodoNode = addNode(flow, "移动审批待办", "list", ["app_mobile_approval"], ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"], "审批人查看采购审批待办列表。", [
    ["待办列表", "list", "展示待审批采购事项。"],
    ["查看详情按钮", "button", "进入审批详情页。"]
  ]);
  const mobileDetailNode = addNode(flow, "移动审批详情页", "task", ["app_mobile_approval"], ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"], "审批人查看采购摘要、报价对比、预算占用和风险提示并处理审批。", [
    ["采购摘要", "summary", "展示采购计划摘要。"],
    ["通过按钮", "button", "审批通过。"],
    ["退回按钮", "button", "退回修改。"],
    ["转交按钮", "button", "转交其他审批人。"]
  ]);
  const contractNode = addNode(flow, "合同生成页", "form", ["app_admin"], ["domain_contract_archive"], ["role_buyer", "role_finance"], "生成合同、编辑付款条款和发送供应商确认。", [
    ["合同编号", "input", "录入合同编号。"],
    ["付款方式", "select", "选择付款方式。"],
    ["发送供应商确认按钮", "button", "发送到供应商门户确认。"]
  ]);
  const supplierContractNode = addNode(flow, "合同确认页", "task", ["app_supplier_portal"], ["domain_supplier", "domain_contract_archive"], ["role_supplier_admin"], "供应商管理员查看合同条款并确认或申请修改。", [
    ["合同预览", "document", "展示合同内容。"],
    ["确认按钮", "button", "确认合同。"],
    ["申请修改按钮", "button", "申请修改合同条款。"]
  ]);
  const archiveNode = addNode(flow, "合同归档页", "detail", ["app_admin", "app_supplier_portal"], ["domain_contract_archive"], ["role_buyer", "role_finance", "role_supplier_admin"], "展示合同状态、签署文件、履约计划、付款节点和操作记录。", [
    ["状态时间线", "timeline", "展示合同流转记录。"],
    ["签署文件", "document", "查看最终合同文件。"],
    ["导出 PDF 按钮", "button", "导出归档文件。"]
  ]);
  const publicListNode = addNode(flow, "采购公告列表", "list", ["app_public_site"], ["domain_public"], ["role_guest_supplier"], "访客供应商筛选并查看公开采购公告。", [
    ["公告筛选表单", "form", "按品类、预算范围、截止时间筛选。"],
    ["查看公告按钮", "button", "进入公告详情。"]
  ]);
  const registerNode = addNode(flow, "供应商注册页", "form", ["app_public_site"], ["domain_public"], ["role_guest_supplier"], "潜在供应商提交企业信息、联系人和资质文件。", [
    ["企业名称", "input", "填写企业名称。"],
    ["资质文件", "upload", "上传资质文件。"],
    ["提交注册按钮", "button", "提交到管理后台审核。"]
  ]);
  const supplierReviewNode = addNode(flow, "供应商审核页", "workspace", ["app_admin"], ["domain_admin"], ["role_system_admin"], "系统管理员处理公开网站提交的供应商注册申请。", [
    ["注册申请列表", "table", "展示待审核供应商。"],
    ["通过按钮", "button", "审核通过。"],
    ["驳回按钮", "button", "驳回注册申请。"]
  ]);

  flow.nodes.forEach((node, index) => {
    node.view = {
      position: {
        x: 60 + (index % 5) * 360,
        y: 60 + Math.floor(index / 5) * 320
      }
    };
  });

  createFlowEdge(flow, { from: { kind: "node", nodeId: workbenchNode.nodeId }, toNodeId: planNode.nodeId, trigger: "新建采购计划", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: planNode.nodeId }, toNodeId: inquiryNode.nodeId, trigger: "提交采购计划", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: inquiryNode.nodeId }, toNodeId: supplierHomeNode.nodeId, trigger: "发布询价", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: supplierHomeNode.nodeId }, toNodeId: quoteNode.nodeId, trigger: "进入报价", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: quoteNode.nodeId }, toNodeId: compareNode.nodeId, trigger: "提交报价", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: compareNode.nodeId }, toNodeId: approvalStartNode.nodeId, trigger: "生成比价报告", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: compareNode.nodeId }, toNodeId: planNode.nodeId, trigger: "回看采购计划", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: approvalStartNode.nodeId }, toNodeId: mobileTodoNode.nodeId, trigger: "发起审批", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: mobileTodoNode.nodeId }, toNodeId: mobileDetailNode.nodeId, trigger: "查看审批详情", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: mobileDetailNode.nodeId }, toNodeId: contractNode.nodeId, trigger: "审批通过", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: mobileDetailNode.nodeId }, toNodeId: inquiryNode.nodeId, trigger: "退回修改", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: contractNode.nodeId }, toNodeId: supplierContractNode.nodeId, trigger: "发送供应商确认", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: supplierContractNode.nodeId }, toNodeId: archiveNode.nodeId, trigger: "供应商确认", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: publicListNode.nodeId }, toNodeId: registerNode.nodeId, trigger: "提交注册", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: registerNode.nodeId }, toNodeId: supplierReviewNode.nodeId, trigger: "注册申请提交", type: "interaction" });
  createFlowEdge(flow, { from: { kind: "node", nodeId: supplierReviewNode.nodeId }, toNodeId: supplierHomeNode.nodeId, trigger: "审核通过开通门户", type: "interaction" });

  if (options.includeAppSurfaceEntryEdges !== false) {
    ensureAppSurfaceEntryEdges(flow);
  }

  return flow;
}

function addNode(
  flow: ProductFlow,
  title: string,
  pageType: string,
  appSurfaceIds: string[],
  domainIds: string[],
  roleIds: string[],
  purpose: string,
  items: Array<[string, string, string]>
): PageNode {
  return createFlowNode(flow, {
    title,
    pageType: normalizePageType(pageType),
    appSurfaceIds,
    domainIds,
    roleIds,
    purpose,
    featureGroups: featureGroups(title, items)
  });
}

function normalizePageType(pageType: string): "skeleton" | "navigation" | "page" | "popup" | "component" {
  if (pageType === "skeleton" || pageType === "navigation" || pageType === "page" || pageType === "popup" || pageType === "component") return pageType;
  if (pageType === "layout" || pageType === "shell") return "skeleton";
  if (pageType === "nav" || pageType === "menu") return "navigation";
  if (pageType === "modal" || pageType === "dialog") return "popup";
  if (pageType === "component" || pageType === "widget") return "component";
  return "page";
}

function featureGroups(title: string, specs: Array<[string, string, string]>): FeatureGroup[] {
  const groupId = `group_${safeId(title)}`;
  return [
    {
      groupId,
      name: "页面功能",
      type: "section",
      description: "页面中的主要功能分组。",
      items: specs.map(([name, type, description], index) => ({
        itemId: `item_${safeId(title)}_${index}`,
        name,
        type,
        description,
        required: type !== "button"
      }))
    }
  ];
}

function safeId(value: string): string {
  return value.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

export function requireNodeByTitle(flow: ProductFlow, title: string): PageNode {
  const node = flow.nodes.find((item) => item.title === title);
  assert.ok(node, `Missing node ${title}`);
  return node;
}

export function assertAppSurfaceEntryEdge(flow: ProductFlow, appId: string, targetTitle: string): void {
  const target = requireNodeByTitle(flow, targetTitle);
  const edge = flow.edges.find((item) =>
    item.status === "active" &&
    item.from?.kind === "appSurface" &&
    (item.from.appId ?? item.from.nodeId) === appId &&
    item.toNodeId === target.nodeId
  );
  assert.ok(edge, `Missing app surface entry edge ${appId} -> ${targetTitle}`);
}

export function assertNoLegacyFields(flow: ProductFlow): void {
  const record = flow as unknown as Record<string, unknown>;
  for (const key of ["sourceDocumentId", "sourceSummary", "artifacts", "changeHistory", "syncState", "productDesignIssues", "openQuestions"]) {
    assert.equal(key in record, false, `Unexpected legacy flow field ${key}`);
  }
  for (const node of flow.nodes) {
    const nodeRecord = node as unknown as Record<string, unknown>;
    for (const key of ["stableKey", "version", "replacementNodeIds", "states", "exceptions", "sourceRefs", "artifacts", "createdByChangeSetId", "updatedByChangeSetId", "removedByChangeSetId", "confidence"]) {
      assert.equal(key in nodeRecord, false, `Unexpected legacy node field ${key}`);
    }
  }
  for (const edge of flow.edges) {
    const edgeRecord = edge as unknown as Record<string, unknown>;
    for (const key of ["sourceRefs", "createdByChangeSetId", "updatedByChangeSetId", "removedByChangeSetId", "confidence"]) {
      assert.equal(key in edgeRecord, false, `Unexpected legacy edge field ${key}`);
    }
  }
}

export function assertNoLegacyKeysInJson(json: string): void {
  for (const key of [
    "sourceDocumentId",
    "sourceSummary",
    "sourceRefs",
    "artifacts",
    "changeHistory",
    "syncState",
    "productDesignIssues",
    "openQuestions",
    "createdByChangeSetId",
    "updatedByChangeSetId",
    "removedByChangeSetId",
    "confidence",
    "stableKey",
    "version",
    "replacementNodeIds",
    "states",
    "exceptions"
  ]) {
    assert.equal(json.includes(`"${key}"`), false, `Serialized flow still contains ${key}`);
  }
}

export function assertThrows(fn: () => unknown, pattern: RegExp): void {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(pattern.test(error.message), `Expected "${error.message}" to match ${pattern}`);
    return;
  }
  assert.ok(false, "Expected function to throw.");
}

export class FakeMemento {
  private readonly values = new Map<string, unknown>();

  public get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  public async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

export interface EndpointCodecHelpers {
  encodeEndpoint(endpoint: Record<string, unknown>): string;
  endpointFromButton(button: { dataset: Record<string, string | undefined> }): unknown;
  parseEndpointValue(value: unknown, fallbackEndpoint?: Record<string, unknown>): unknown;
  endpointKey(endpoint: Record<string, unknown>): string;
}

export interface SelectionRelationItem {
  kind: string;
  id: string;
  title: string;
}

export interface SelectionRelationGroups {
  from: SelectionRelationItem[];
  to: SelectionRelationItem[];
}

export interface SelectionRelationHelpers {
  getSelectionRelationGroups(flow: unknown, selectedNode: unknown, selectedEdge: unknown): SelectionRelationGroups | null;
}

export interface SelectionRelationHighlightCard {
  offsetWidth: number;
  classList: {
    add(value: string): void;
    remove(value: string): void;
  };
}

export interface SelectionRelationHighlightHelpers {
  flashSelectionRelationCard(kind: string, id: string): boolean;
  clearSelectionRelationCardHighlight(): void;
  durationMs: number;
}

export interface CanvasViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CanvasViewportSize {
  width: number;
  height: number;
}

export interface CanvasViewportFit {
  zoom: number;
  camera: {
    x: number;
    y: number;
  };
}

export interface CanvasCardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasViewportHelpers {
  canvasViewportFitForBounds(bounds: CanvasViewportBounds | null, viewport: CanvasViewportSize, padding?: number): CanvasViewportFit | null;
  canvasViewportFocusForCard(card: CanvasCardBounds, viewport: CanvasViewportSize, padding?: number): CanvasViewportFit | null;
  canvasViewportAnimationDuration(from: CanvasViewportFit, to: CanvasViewportFit): number;
  canvasViewportAnimationState(from: CanvasViewportFit, to: CanvasViewportFit, progress: number): CanvasViewportFit;
  canvasViewportAnimationIsSettled(from: CanvasViewportFit, to: CanvasViewportFit): boolean;
}

export interface CanvasNodeClipboardHelpers {
  createSelectedNodeClipboardPayload(): Record<string, unknown> | null;
  isCanvasCommandModifier(event: Record<string, unknown>): boolean;
  handleNodeClipboardShortcut(event: Record<string, unknown>): boolean;
}

export interface CanvasSelectAllShortcutHelpers {
  handleSelectAllNodesShortcut(event: Record<string, unknown>): boolean;
}

export interface CanvasViewSelectionHelpers {
  allNodeSelectionForFlow(flow: unknown, currentPrimaryNodeId: string): {
    nodeIds: string[];
    primaryNodeId: string;
  } | null;
  activeSelectedNodeIds(flow: unknown, nodeIds: string[]): string[];
}

export interface CanvasCardDragHelpers {
  selectedNodeDragMembers(draggedNodeId: string): Array<{
    id: string;
    card: unknown;
    originX: number;
    originY: number;
  }>;
  nodeGroupDragPositions(
    members: Array<{ id: string; originX: number; originY: number }>,
    screenDx: number,
    screenDy: number,
    currentZoom: number
  ): Array<{ id: string; x: number; y: number }>;
}

export interface CanvasDeleteSelectionHelpers {
  deleteSelectedNodes(): boolean;
}

export interface AutoLayoutPosition {
  x: number;
  y: number;
}

export interface AutoLayoutItem {
  id: string;
  kind: string;
  layer: number;
  laneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoLayoutResult {
  projectOverviewPosition: AutoLayoutPosition;
  appSurfacePositions: Record<string, AutoLayoutPosition>;
  nodePositions: Record<string, AutoLayoutPosition>;
  nodeLaneIds: Record<string, string>;
  items: AutoLayoutItem[];
  columnGap: number;
}

export interface AutoLayoutHelpers {
  autoLayoutComputePreview(flow: unknown, measurements?: unknown): AutoLayoutResult;
  autoLayoutCreatePreviewState(flow: unknown, layout: AutoLayoutResult): unknown;
  autoLayoutPreviewPositionsForFlow(flow: unknown, previewState: unknown): AutoLayoutResult | null;
  autoLayoutPreviewStateWithPosition(previewState: unknown, kind: string, id: string, position: AutoLayoutPosition): unknown;
  autoLayoutEstimateLabelWidth(value: unknown): number;
}

export async function loadEndpointCodecHelpers(): Promise<EndpointCodecHelpers> {
  const source = await readWebviewRuntimeFile("data", "canvas-endpoint-codec.js");
  const factory = new Function(
    "PROJECT_OVERVIEW_NODE_ID",
    "getFeatureGroups",
    `${source}\nreturn { encodeEndpoint, endpointFromButton, parseEndpointValue, endpointKey };`
  ) as (projectOverviewNodeId: string, getFeatureGroups: (node: unknown) => unknown[]) => EndpointCodecHelpers;
  return factory("projectOverview", () => []);
}

export async function loadSelectionRelationHelpers(): Promise<SelectionRelationHelpers> {
  const source = await readWebviewRuntimeFile("rendering", "canvas-selection-relations.js");
  const factory = new Function(
    "PROJECT_OVERVIEW_NODE_ID",
    `${source}\nreturn { getSelectionRelationGroups };`
  ) as (projectOverviewNodeId: string) => SelectionRelationHelpers;
  return factory("projectOverview");
}

export async function loadSelectionRelationHighlightHelpers(options: {
  getCardElement(kind: string, id: string): SelectionRelationHighlightCard | null;
  setTimeout(callback: () => void, durationMs: number): unknown;
  clearTimeout(timer: unknown): void;
}): Promise<SelectionRelationHighlightHelpers> {
  const source = await readWebviewRuntimeFile("rendering", "canvas-selection-relations.js");
  const factory = new Function(
    "PROJECT_OVERVIEW_NODE_ID",
    "getCardElement",
    "setTimeout",
    "clearTimeout",
    `${source}\nreturn { flashSelectionRelationCard, clearSelectionRelationCardHighlight, durationMs: SELECTION_RELATION_CARD_HIGHLIGHT_DURATION_MS };`
  ) as (
    projectOverviewNodeId: string,
    getCardElement: typeof options.getCardElement,
    setTimeoutCallback: typeof options.setTimeout,
    clearTimeoutCallback: typeof options.clearTimeout
  ) => SelectionRelationHighlightHelpers;
  return factory("projectOverview", options.getCardElement, options.setTimeout, options.clearTimeout);
}

export async function loadCanvasViewportHelpers(): Promise<CanvasViewportHelpers> {
  const source = await readWebviewRuntimeFile("interactions", "canvas-camera.js");
  const factory = new Function(
    "MIN_ZOOM",
    "MAX_ZOOM",
    "clamp",
    `${source}\nreturn { canvasViewportFitForBounds, canvasViewportFocusForCard, canvasViewportAnimationDuration, canvasViewportAnimationState, canvasViewportAnimationIsSettled };`
  ) as (minZoom: number, maxZoom: number, clamp: (value: number, min: number, max: number) => number) => CanvasViewportHelpers;
  return factory(0.05, 2.6, (value, min, max) => Math.min(max, Math.max(min, value)));
}

export async function loadCanvasNodeClipboardHelpers(options: {
  state: unknown;
  selectedNodeIds: string[];
  selectedNodeId: string;
  nodePositions: Map<string, { x: number; y: number }>;
  isEditingTarget?: (target: unknown) => boolean;
  postWebviewMessage?: (message: unknown) => void;
  setCommandStatus?: (ok: boolean, message: string) => void;
  updateCommandStatusElement?: () => void;
}): Promise<CanvasNodeClipboardHelpers> {
  const source = await readWebviewRuntimeFile("interactions", "canvas-node-clipboard.js");
  const factory = new Function(
    "state",
    "selectedNodeIds",
    "selectedNodeId",
    "nodePositions",
    "isEditingTarget",
    "postWebviewMessage",
    "setCommandStatus",
    "updateCommandStatusElement",
    "document",
    "screenToWorld",
    `${source}\nreturn { createSelectedNodeClipboardPayload, isCanvasCommandModifier, handleNodeClipboardShortcut };`
  ) as (
    state: unknown,
    selectedNodeIds: string[],
    selectedNodeId: string,
    nodePositions: Map<string, { x: number; y: number }>,
    isEditingTarget: (target: unknown) => boolean,
    postWebviewMessage: (message: unknown) => void,
    setCommandStatus: (ok: boolean, message: string) => void,
    updateCommandStatusElement: () => void,
    document: unknown,
    screenToWorld: () => { x: number; y: number }
  ) => CanvasNodeClipboardHelpers;
  return factory(
    options.state,
    options.selectedNodeIds,
    options.selectedNodeId,
    options.nodePositions,
    options.isEditingTarget || (() => false),
    options.postWebviewMessage || (() => undefined),
    options.setCommandStatus || (() => undefined),
    options.updateCommandStatusElement || (() => undefined),
    { getElementById: () => null },
    () => ({ x: 0, y: 0 })
  );
}

export async function loadCanvasSelectAllShortcutHelpers(options: {
  isEditingTarget?: (target: unknown) => boolean;
  selectAllNodes?: () => boolean;
  getSelection?: () => { rangeCount: number; removeAllRanges(): void } | null;
} = {}): Promise<CanvasSelectAllShortcutHelpers> {
  const source = await readWebviewRuntimeFile("interactions", "canvas-interactions.js");
  const factory = new Function(
    "isEditingTarget",
    "isCanvasCommandModifier",
    "selectAllNodes",
    "window",
    `${source}\nreturn { handleSelectAllNodesShortcut };`
  ) as (
    isEditingTarget: (target: unknown) => boolean,
    isCanvasCommandModifier: (event: Record<string, unknown>) => boolean,
    selectAllNodes: () => boolean,
    window: { getSelection(): { rangeCount: number; removeAllRanges(): void } | null }
  ) => CanvasSelectAllShortcutHelpers;
  return factory(
    options.isEditingTarget || (() => false),
    (event) => Boolean((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey),
    options.selectAllNodes || (() => false),
    { getSelection: options.getSelection || (() => null) }
  );
}

export async function loadCanvasViewSelectionHelpers(): Promise<CanvasViewSelectionHelpers> {
  const source = await readWebviewRuntimeFile("data", "canvas-view.js");
  const factory = new Function(
    "uniqueStringIds",
    `${source}\nreturn { allNodeSelectionForFlow, activeSelectedNodeIds };`
  ) as (uniqueStringIds: (values: unknown) => string[]) => CanvasViewSelectionHelpers;
  return factory((values) => Array.from(new Set(
    Array.isArray(values) ? values.filter((value): value is string => typeof value === "string" && Boolean(value)) : []
  )));
}

export async function loadCanvasCardDragHelpers(options: {
  state: unknown;
  selectedNodeIds: string[];
  nodePositions: Map<string, { x: number; y: number }>;
  isNodeSelected: (nodeId: string) => boolean;
  getCardElement: (kind: string, nodeId: string) => unknown;
}): Promise<CanvasCardDragHelpers> {
  const source = await readWebviewRuntimeFile("interactions", "canvas-card-drag.js");
  const factory = new Function(
    "state",
    "selectedNodeIds",
    "nodePositions",
    "isNodeSelected",
    "activeSelectedNodeIds",
    "getCardElement",
    `${source}\nreturn { selectedNodeDragMembers, nodeGroupDragPositions };`
  ) as (
    state: unknown,
    selectedNodeIds: string[],
    nodePositions: Map<string, { x: number; y: number }>,
    isNodeSelected: (nodeId: string) => boolean,
    activeSelectedNodeIds: (flow: { nodes: Array<{ nodeId: string; status: string }> }, nodeIds: string[]) => string[],
    getCardElement: (kind: string, nodeId: string) => unknown
  ) => CanvasCardDragHelpers;
  return factory(
    options.state,
    options.selectedNodeIds,
    options.nodePositions,
    options.isNodeSelected,
    (flow, nodeIds) => {
      const activeIds = new Set(flow.nodes.filter((node) => node.status !== "removed").map((node) => node.nodeId));
      return Array.from(new Set(nodeIds)).filter((nodeId) => activeIds.has(nodeId));
    },
    options.getCardElement
  );
}

export async function loadCanvasDeleteSelectionHelpers(options: {
  state: unknown;
  selectedNodeIds: string[];
  postWebviewMessage: (message: unknown) => void;
  clearNodeSelectionState?: () => void;
  clearTimeout?: (timer: unknown) => void;
}): Promise<CanvasDeleteSelectionHelpers> {
  const source = await readWebviewRuntimeFile("interactions", "canvas-interactions.js");
  const factory = new Function(
    "state",
    "selectedNodeIds",
    "activeSelectedNodeIds",
    "clearTimeout",
    "nodeDetailsSaveTimer",
    "clearNodeSelectionState",
    "selectedEdgeId",
    "postWebviewMessage",
    `${source}\nreturn { deleteSelectedNodes };`
  ) as (
    state: unknown,
    selectedNodeIds: string[],
    activeSelectedNodeIds: (flow: { nodes: Array<{ nodeId: string; status: string }> }, nodeIds: string[]) => string[],
    clearTimeout: (timer: unknown) => void,
    nodeDetailsSaveTimer: unknown,
    clearNodeSelectionState: () => void,
    selectedEdgeId: string,
    postWebviewMessage: (message: unknown) => void
  ) => CanvasDeleteSelectionHelpers;
  return factory(
    options.state,
    options.selectedNodeIds,
    (flow, nodeIds) => {
      const activeIds = new Set(flow.nodes.filter((node) => node.status !== "removed").map((node) => node.nodeId));
      return Array.from(new Set(nodeIds)).filter((nodeId) => activeIds.has(nodeId));
    },
    options.clearTimeout || (() => undefined),
    null,
    options.clearNodeSelectionState || (() => undefined),
    "",
    options.postWebviewMessage
  );
}

export async function loadAutoLayoutHelpers(): Promise<AutoLayoutHelpers> {
  const source = await readWebviewRuntimeFiles([
    ["layout", "canvas-auto-layout-engine.js"],
    ["layout", "canvas-auto-layout-preview-state.js"],
    ["layout", "canvas-auto-layout-dom.js"]
  ]);
  const factory = new Function(`${source}\nreturn { autoLayoutComputePreview, autoLayoutCreatePreviewState, autoLayoutPreviewPositionsForFlow, autoLayoutPreviewStateWithPosition, autoLayoutEstimateLabelWidth };`) as () => AutoLayoutHelpers;
  return factory();
}

export function assertNoAutoLayoutOverlap(items: AutoLayoutItem[]): void {
  const margin = 44;
  for (let index = 0; index < items.length; index += 1) {
    const left = items[index];
    assert.ok(left);
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      const right = items[otherIndex];
      assert.ok(right);
      const overlaps: boolean = left.x - margin < right.x + right.width + margin &&
        left.x + left.width + margin > right.x - margin &&
        left.y - margin < right.y + right.height + margin &&
        left.y + left.height + margin > right.y - margin;
      assert.equal(overlaps, false, `${left.id} should not overlap ${right.id}`);
    }
  }
}

async function readWebviewRuntimeFiles(files: Array<[string, string]>): Promise<string> {
  const sources = await Promise.all(files.map(([directory, fileName]) => readWebviewRuntimeFile(directory, fileName)));
  return sources.join("\n");
}

async function readWebviewRuntimeFile(directory: string, fileName: string): Promise<string> {
  const sourceFileName = fileName.replace(/\.js$/, ".ts");
  const source = await fs.readFile(
    path.join(process.cwd(), "src", "platform", "webview", "canvas", "client", directory, sourceFileName),
    "utf8"
  );
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 }
  }).outputText;
}
