import type { AgentProvider, AnalyzeDocumentInput, FlowChangeInput, PencilArtifact, PrdArtifact } from "./AgentProvider";
import type { ArtifactImpact, FlowChangePlan, FlowOperation } from "../models/flowChange";
import type { EdgeType, FlowEdge, PageAction, PageElement, PageNode, ProductFlow } from "../models/productFlow";
import {
  makeActionId,
  makeChangeSetId,
  makeEdgeId,
  makeElementId,
  makeFeatureGroupId,
  makeFeatureItemId,
  makeFlowId,
  makeNodeId,
  makePencilId,
  makePrdId,
  nowIso,
  stableKey
} from "../utils/id";

export class MockProvider implements AgentProvider {
  public readonly id = "mock" as const;

  public async analyzeDocument(input: AnalyzeDocumentInput): Promise<ProductFlow> {
    return createMockFlow(input.documentText, input.documentName, input.sourceDocumentId);
  }

  public async proposeFlowChanges(input: FlowChangeInput): Promise<FlowChangePlan> {
    return createMockChangePlan(input.flow, input.instruction, input.selectedNodeId);
  }

  public async generateNodePrd(flow: ProductFlow, node: PageNode, changeSetId?: string): Promise<PrdArtifact> {
    const prdId = makePrdId(`${flow.flowId}:${node.nodeId}`);
    const now = nowIso();
    return {
      metadata: {
        prdId,
        flowId: flow.flowId,
        scope: "node",
        nodeId: node.nodeId,
        linkedPencilIds: [...node.artifacts.pencilIds],
        linkedJsonPath: "",
        generatedBy: "mock",
        createdAt: now,
        updatedAt: now,
        refreshedByChangeSetId: changeSetId
      },
      markdown: renderNodePrd(flow, node)
    };
  }

  public async generateFullPrd(flow: ProductFlow, changeSetId?: string): Promise<PrdArtifact> {
    const prdId = makePrdId(`${flow.flowId}:full`);
    const now = nowIso();
    return {
      metadata: {
        prdId,
        flowId: flow.flowId,
        scope: "full",
        linkedPencilIds: flow.artifacts.pencils.map((item) => item.pencilId),
        linkedJsonPath: "",
        generatedBy: "mock",
        createdAt: now,
        updatedAt: now,
        refreshedByChangeSetId: changeSetId
      },
      markdown: renderFullPrd(flow)
    };
  }

  public async generateNodePencil(flow: ProductFlow, node: PageNode, changeSetId?: string): Promise<PencilArtifact> {
    const pencilId = makePencilId(`${flow.flowId}:${node.nodeId}`);
    const now = nowIso();
    return {
      metadata: {
        pencilId,
        flowId: flow.flowId,
        scope: "node",
        nodeId: node.nodeId,
        linkedPrdIds: [...node.artifacts.prdIds],
        linkedJsonPath: "",
        generatedBy: "mock",
        createdAt: now,
        updatedAt: now,
        refreshedByChangeSetId: changeSetId
      },
      spec: renderPencilSpec(flow, [node])
    };
  }

  public async generateFullPencil(flow: ProductFlow, changeSetId?: string): Promise<PencilArtifact> {
    const pencilId = makePencilId(`${flow.flowId}:full`);
    const now = nowIso();
    return {
      metadata: {
        pencilId,
        flowId: flow.flowId,
        scope: "full",
        linkedPrdIds: flow.artifacts.prds.map((item) => item.prdId),
        linkedJsonPath: "",
        generatedBy: "mock",
        createdAt: now,
        updatedAt: now,
        refreshedByChangeSetId: changeSetId
      },
      spec: renderPencilSpec(flow, flow.nodes.filter((node) => node.status === "active"))
    };
  }
}

export function createMockFlow(documentText: string, documentName = "示例需求", sourceDocumentId?: string): ProductFlow {
  const now = nowIso();
  const flowId = makeFlowId(documentName);
  const domains = [
    { domainId: "domain_plan", name: "采购计划", description: "需求池、计划新建、计划详情与附件材料。" },
    { domainId: "domain_sourcing", name: "询价比价", description: "询价方案、供应商邀请、报价对比和比价报告。" },
    { domainId: "domain_supplier", name: "供应商投标", description: "门户首页、报价填写、报价撤回和合同确认。" },
    { domainId: "domain_mobile_approval", name: "移动审批", description: "待办列表、审批详情、通过、退回和转交。" },
    { domainId: "domain_contract_archive", name: "合同归档", description: "合同生成、供应商确认、归档详情和履约节点。" },
    { domainId: "domain_public", name: "公开采购公告", description: "公告列表、公告详情和供应商注册。" },
    { domainId: "domain_admin", name: "系统管理", description: "供应商审核、角色权限和黑名单维护。" }
  ];
  const roles = [
    { roleId: "role_buyer", name: "采购专员", description: "创建采购计划、发布询价、对比报价、发起审批。", domainIds: ["domain_plan", "domain_sourcing"] },
    { roleId: "role_purchase_manager", name: "采购经理", description: "审批采购方案，查看预算和供应商风险。", domainIds: ["domain_mobile_approval", "domain_sourcing"] },
    { roleId: "role_finance", name: "财务审核员", description: "审核预算占用、付款条款和财务风险。", domainIds: ["domain_mobile_approval", "domain_contract_archive"] },
    { roleId: "role_general_manager", name: "总经理", description: "审批高金额采购。", domainIds: ["domain_mobile_approval"] },
    { roleId: "role_supplier_sales", name: "供应商销售", description: "查看询价、提交报价和撤回报价。", domainIds: ["domain_supplier"] },
    { roleId: "role_supplier_admin", name: "供应商管理员", description: "管理供应商资料、确认合同。", domainIds: ["domain_supplier", "domain_contract_archive"] },
    { roleId: "role_guest_supplier", name: "访客供应商", description: "浏览公开公告并提交注册。", domainIds: ["domain_public"] },
    { roleId: "role_system_admin", name: "系统管理员", description: "审核供应商注册、维护供应商黑名单和权限。", domainIds: ["domain_admin"] }
  ];
  const appSurfaces = [
    {
      appId: "app_admin",
      name: "管理后台",
      type: "admin" as const,
      description: "采购专员、采购经理、财务和系统管理员使用的运营后台。",
      domainIds: ["domain_plan", "domain_sourcing", "domain_contract_archive", "domain_admin"],
      roleIds: ["role_buyer", "role_purchase_manager", "role_finance", "role_system_admin"]
    },
    {
      appId: "app_supplier_portal",
      name: "供应商门户",
      type: "web" as const,
      description: "供应商查看询价、提交报价和确认合同的门户。",
      domainIds: ["domain_supplier", "domain_contract_archive"],
      roleIds: ["role_supplier_sales", "role_supplier_admin"]
    },
    {
      appId: "app_mobile_approval",
      name: "移动审批 App",
      type: "app" as const,
      description: "审批人处理采购审批待办的移动应用。",
      domainIds: ["domain_mobile_approval"],
      roleIds: ["role_purchase_manager", "role_finance", "role_general_manager"]
    },
    {
      appId: "app_public_site",
      name: "公开采购网站",
      type: "web" as const,
      description: "访客供应商浏览采购公告并提交注册的公开站点。",
      domainIds: ["domain_public"],
      roleIds: ["role_guest_supplier"]
    }
  ];

  const workbenchNode = createNode("采购工作台", "workspace", ["app_admin"], ["domain_plan", "domain_sourcing"], ["role_buyer"], "采购专员查看需求池、待处理计划、报价和审批状态。", [
    ["需求池列表", "table", "展示待采购需求。"],
    ["新建计划按钮", "button", "进入采购计划新建页。"],
    ["待处理任务", "list", "展示待发布询价和待发起审批事项。"]
  ]);
  const planNode = createNode("采购计划新建页", "form", ["app_admin"], ["domain_plan"], ["role_buyer"], "录入采购计划基础信息、预算和需求附件。", [
    ["计划编号", "input", "录入或自动生成采购计划编号。"],
    ["采购品类", "select", "选择采购品类。"],
    ["预算金额", "currency", "录入预算金额。"],
    ["需求说明书", "upload", "上传需求说明材料。"],
    ["提交计划按钮", "button", "提交并进入询价方案编辑。"]
  ]);
  const inquiryNode = createNode("询价方案编辑页", "form", ["app_admin"], ["domain_sourcing"], ["role_buyer"], "维护供应商筛选条件、询价明细并发布询价。", [
    ["供应商等级", "select", "筛选供应商等级。"],
    ["历史履约评分", "number", "筛选历史评分。"],
    ["物料明细表", "table", "维护物料名称、规格、数量和目标价格。"],
    ["发布询价按钮", "button", "发布询价并通知供应商门户。"]
  ]);
  const supplierHomeNode = createNode("供应商门户首页", "home", ["app_supplier_portal"], ["domain_supplier"], ["role_supplier_sales", "role_supplier_admin"], "供应商查看定向询价、报价状态和合同确认任务。", [
    ["询价任务列表", "table", "展示可报价询价。"],
    ["合同待确认列表", "list", "展示待确认合同。"],
    ["进入报价按钮", "button", "进入报价填写页。"]
  ]);
  const quoteNode = createNode("报价填写页", "form", ["app_supplier_portal"], ["domain_supplier"], ["role_supplier_sales"], "供应商填写报价金额、交付周期并上传报价材料。", [
    ["报价金额", "currency", "填写报价金额。"],
    ["交付周期", "input", "填写承诺交付周期。"],
    ["资质文件", "upload", "上传资质材料。"],
    ["提交报价按钮", "button", "提交报价到管理后台。"]
  ]);
  const compareNode = createNode("报价对比页", "workspace", ["app_admin"], ["domain_sourcing"], ["role_buyer"], "采购专员筛选、对比供应商报价并生成比价报告。", [
    ["供应商名称", "input", "按供应商名称筛选。"],
    ["报价结果列表", "table", "展示供应商、报价、税率、交期、评分和风险标签。"],
    ["查询按钮", "button", "查询报价列表。"],
    ["生成比价报告按钮", "button", "生成比价报告。"]
  ]);
  const approvalStartNode = createNode("审批发起页", "form", ["app_admin"], ["domain_sourcing", "domain_mobile_approval"], ["role_buyer"], "采购专员确认推荐供应商和审批流后发起移动审批。", [
    ["推荐供应商", "select", "选择推荐中标供应商。"],
    ["预算差异", "currency", "展示预算差异。"],
    ["审批流选择", "select", "选择采购经理、财务审核员和总经理。"],
    ["发起审批按钮", "button", "发送审批待办到移动审批 App。"]
  ]);
  const mobileTodoNode = createNode("移动审批待办", "list", ["app_mobile_approval"], ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"], "审批人查看采购审批待办列表。", [
    ["待办列表", "list", "展示待审批采购事项。"],
    ["查看详情按钮", "button", "进入审批详情页。"]
  ]);
  const mobileDetailNode = createNode("移动审批详情页", "task", ["app_mobile_approval"], ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"], "审批人查看采购摘要、报价对比、预算占用和风险提示并处理审批。", [
    ["采购摘要", "summary", "展示采购计划摘要。"],
    ["风险提示", "alert", "展示供应商风险和预算风险。"],
    ["通过按钮", "button", "审批通过。"],
    ["退回按钮", "button", "退回修改。"],
    ["转交按钮", "button", "转交其他审批人。"]
  ]);
  const contractNode = createNode("合同生成页", "form", ["app_admin"], ["domain_contract_archive"], ["role_buyer", "role_finance"], "生成合同、编辑付款条款和发送供应商确认。", [
    ["合同编号", "input", "录入合同编号。"],
    ["付款方式", "select", "选择付款方式。"],
    ["条款编辑器", "richText", "编辑付款条款、违约责任和验收标准。"],
    ["发送供应商确认按钮", "button", "发送到供应商门户确认。"]
  ]);
  const supplierContractNode = createNode("合同确认页", "task", ["app_supplier_portal"], ["domain_supplier", "domain_contract_archive"], ["role_supplier_admin"], "供应商管理员查看合同条款并确认或申请修改。", [
    ["合同预览", "document", "展示合同内容。"],
    ["确认按钮", "button", "确认合同。"],
    ["申请修改按钮", "button", "申请修改合同条款。"]
  ]);
  const archiveNode = createNode("合同归档页", "detail", ["app_admin", "app_supplier_portal"], ["domain_contract_archive"], ["role_buyer", "role_finance", "role_supplier_admin"], "展示合同状态、签署文件、履约计划、付款节点和操作记录。", [
    ["状态时间线", "timeline", "展示合同流转记录。"],
    ["签署文件", "document", "查看最终合同文件。"],
    ["履约计划表", "table", "展示履约和付款节点。"],
    ["导出 PDF 按钮", "button", "导出归档文件。"]
  ]);
  const publicListNode = createNode("采购公告列表", "list", ["app_public_site"], ["domain_public"], ["role_guest_supplier"], "访客供应商筛选并查看公开采购公告。", [
    ["公告筛选表单", "form", "按品类、预算范围、截止时间筛选。"],
    ["公告列表", "table", "展示公开采购公告。"],
    ["查看公告按钮", "button", "进入公告详情。"]
  ]);
  const registerNode = createNode("供应商注册页", "form", ["app_public_site"], ["domain_public"], ["role_guest_supplier"], "潜在供应商提交企业信息、联系人和资质文件。", [
    ["企业名称", "input", "填写企业名称。"],
    ["联系人", "input", "填写联系人信息。"],
    ["资质文件", "upload", "上传资质文件。"],
    ["提交注册按钮", "button", "提交到管理后台审核。"]
  ]);
  const supplierReviewNode = createNode("供应商审核页", "workspace", ["app_admin"], ["domain_admin"], ["role_system_admin"], "系统管理员处理公开网站提交的供应商注册申请。", [
    ["注册申请列表", "table", "展示待审核供应商。"],
    ["审核意见", "textarea", "填写审核意见。"],
    ["通过按钮", "button", "审核通过。"],
    ["驳回按钮", "button", "驳回注册申请。"]
  ]);

  const nodes = [
    workbenchNode,
    planNode,
    inquiryNode,
    supplierHomeNode,
    quoteNode,
    compareNode,
    approvalStartNode,
    mobileTodoNode,
    mobileDetailNode,
    contractNode,
    supplierContractNode,
    archiveNode,
    publicListNode,
    registerNode,
    supplierReviewNode
  ];
  nodes.forEach((node, index) => {
    node.view = {
      position: {
        x: 60 + (index % 5) * 360,
        y: 60 + Math.floor(index / 5) * 320
      }
    };
  });
  const edges = [
    createEdge(workbenchNode, planNode, "新建采购计划", "create", ["domain_plan"], ["role_buyer"]),
    createEdge(planNode, inquiryNode, "提交采购计划", "submit", ["domain_plan", "domain_sourcing"], ["role_buyer"]),
    createEdge(inquiryNode, supplierHomeNode, "发布询价", "submit", ["domain_sourcing", "domain_supplier"], ["role_buyer", "role_supplier_sales"]),
    createEdge(supplierHomeNode, quoteNode, "进入报价", "navigate", ["domain_supplier"], ["role_supplier_sales"]),
    createEdge(quoteNode, compareNode, "提交报价", "submit", ["domain_supplier", "domain_sourcing"], ["role_supplier_sales", "role_buyer"]),
    createEdge(compareNode, approvalStartNode, "生成比价报告", "create", ["domain_sourcing", "domain_mobile_approval"], ["role_buyer"]),
    createEdge(compareNode, planNode, "回看采购计划", "navigate", ["domain_sourcing", "domain_plan"], ["role_buyer"]),
    createEdge(approvalStartNode, mobileTodoNode, "发起审批", "submit", ["domain_mobile_approval"], ["role_buyer", "role_purchase_manager", "role_finance", "role_general_manager"]),
    createEdge(mobileTodoNode, mobileDetailNode, "查看审批详情", "navigate", ["domain_mobile_approval"], ["role_purchase_manager", "role_finance", "role_general_manager"]),
    createEdge(mobileDetailNode, contractNode, "审批通过", "approve", ["domain_mobile_approval", "domain_contract_archive"], ["role_purchase_manager", "role_finance", "role_general_manager", "role_buyer"]),
    createEdge(mobileDetailNode, inquiryNode, "退回修改", "reject", ["domain_mobile_approval", "domain_sourcing"], ["role_purchase_manager", "role_finance", "role_buyer"]),
    createEdge(contractNode, supplierContractNode, "发送供应商确认", "submit", ["domain_contract_archive", "domain_supplier"], ["role_buyer", "role_supplier_admin"]),
    createEdge(supplierContractNode, archiveNode, "供应商确认", "submit", ["domain_contract_archive"], ["role_supplier_admin", "role_buyer"]),
    createEdge(publicListNode, registerNode, "提交注册", "create", ["domain_public"], ["role_guest_supplier"]),
    createEdge(registerNode, supplierReviewNode, "注册申请提交", "submit", ["domain_public", "domain_admin"], ["role_guest_supplier", "role_system_admin"]),
    createEdge(supplierReviewNode, supplierHomeNode, "审核通过开通门户", "approve", ["domain_admin", "domain_supplier"], ["role_system_admin", "role_supplier_admin"])
  ];

  return {
    schemaVersion: "1.0.0",
    flowId,
    revision: 1,
    title: inferTitle(documentText, documentName),
    sourceDocumentId: sourceDocumentId ?? `source_${stableKey(documentName, documentText.slice(0, 100))}`,
    sourceSummary: "基于示例需求生成的多应用端采购协同平台产品流程。",
    createdAt: now,
    updatedAt: now,
    domains,
    roles,
    appSurfaces,
    nodes,
    edges,
    artifacts: {
      prds: [],
      pencils: []
    },
    changeHistory: [],
    syncState: {
      issues: []
    },
    openQuestions: []
  };
}

function createNode(
  title: string,
  pageType: string,
  appSurfaceIds: string[],
  domainIds: string[],
  roleIds: string[],
  purpose: string,
  elementSpecs: Array<[string, string, string]>
): PageNode {
  const nodeId = makeNodeId(title, title);
  const elements: PageElement[] = elementSpecs.map(([name, type, description]) => ({
    elementId: makeElementId(name, `${nodeId}:${name}`),
    name,
    type,
    description,
      required: type !== "button"
    }));
  const groupId = makeFeatureGroupId("页面功能", `${nodeId}:features`);
  const featureGroups = [
    {
      groupId,
      name: "页面功能",
      type: "section",
      description: "页面中的主要功能分组。",
      items: elements.map((element) => ({
        itemId: makeFeatureItemId(element.name, `${nodeId}:${groupId}:${element.elementId}`),
        name: element.name,
        type: element.type,
        description: element.description,
        dataBinding: element.dataBinding,
        required: element.required
      }))
    }
  ];
  const actions = elements
    .filter((element) => element.type === "button")
    .map((element) => ({
      actionId: makeActionId(element.name, `${nodeId}:${element.name}`),
      label: element.name,
      type: "user",
      result: element.description
    }));
  return {
    nodeId,
    stableKey: stableKey(title, purpose),
    status: "active",
    version: 1,
    title,
    pageType,
    appSurfaceIds,
    domainIds,
    roleIds,
    purpose,
    featureGroups,
    elements,
    actions,
    states: [
      { stateId: `state_${stableKey(nodeId, "default")}`, name: "默认态", description: "页面加载并可正常操作。" }
    ],
    exceptions: [
      { exceptionId: `ex_${stableKey(nodeId, "validation")}`, name: "校验失败", handling: "提示用户修正字段后重试。" }
    ],
    inputs: [],
    outputs: [],
    permissions: roleIds,
    sourceRefs: [{ sourceId: "mock", label: "MockProvider", excerpt: purpose }],
    artifacts: { prdIds: [], pencilIds: [] },
    confidence: 0.78
  };
}

function createEdge(
  from: PageNode,
  to: PageNode,
  action: string,
  type: EdgeType,
  domainIds: string[],
  roleIds: string[],
  condition?: string
): FlowEdge {
  return {
    edgeId: makeEdgeId(from.nodeId, to.nodeId, action),
    status: "active",
    fromNodeId: from.nodeId,
    toNodeId: to.nodeId,
    from: { kind: "node", nodeId: from.nodeId },
    to: { kind: "node", nodeId: to.nodeId },
    action,
    trigger: action,
    type,
    condition,
    appSurfaceIds: mergeUnique(from.appSurfaceIds ?? [], to.appSurfaceIds ?? []),
    domainIds,
    roleIds,
    sourceRefs: [{ sourceId: "mock", label: "MockProvider", excerpt: `${from.title} -> ${to.title}` }],
    confidence: 0.76
  };
}

function createMockChangePlan(flow: ProductFlow, instruction: string, selectedNodeId?: string): FlowChangePlan {
  const changeSetId = makeChangeSetId(instruction);
  const activeNodes = flow.nodes.filter((node) => node.status === "active");
  const selectedNode = selectedNodeId ? flow.nodes.find((node) => node.nodeId === selectedNodeId) : undefined;
  const operations: FlowOperation[] = [];
  const affectedNodeIds = new Set<string>();
  const affectedEdgeIds = new Set<string>();

  const insertMatch = /在(.+?)和(.+?)之间(?:加入|新增|插入)(.+?)(?:业务|页面|流程|$)/.exec(instruction);
  if (insertMatch) {
    const from = findNode(flow, insertMatch[1] ?? "");
    const to = findNode(flow, insertMatch[2] ?? "");
    const businessName = cleanName(insertMatch[3] ?? "新增业务");
    if (!from || !to) {
      return clarificationPlan(flow, changeSetId, instruction, `无法定位需要插入业务的起止节点，请确认节点名称。`);
    }
    const newNode = createNode(`${businessName}页`, "workflow", mergeUnique(from.appSurfaceIds ?? [], to.appSurfaceIds ?? []), mergeUnique(from.domainIds, to.domainIds), mergeUnique(from.roleIds, to.roleIds), `处理${businessName}业务并衔接${from.title}与${to.title}。`, [
      [`${businessName}信息`, "form", `录入或查看${businessName}所需信息。`],
      ["确认按钮", "button", `完成${businessName}并进入下一步。`]
    ]);
    newNode.createdByChangeSetId = changeSetId;
    const originalEdge = flow.edges.find((edge) => edge.status === "active" && edge.fromNodeId === from.nodeId && edge.toNodeId === to.nodeId);
    operations.push({
      opId: `${changeSetId}_op_add_node`,
      type: "addNode",
      target: { nodeId: newNode.nodeId },
      before: null,
      after: newNode,
      reason: instruction,
      risk: "medium",
      requiresConfirmation: false
    });
    if (originalEdge) {
      operations.push({
        opId: `${changeSetId}_op_remove_edge`,
        type: "removeEdge",
        target: { edgeId: originalEdge.edgeId },
        before: originalEdge,
        after: { ...originalEdge, status: "removed", removedByChangeSetId: changeSetId },
        reason: "插入新业务节点后替换原直接路径。",
        risk: "medium",
        requiresConfirmation: true
      });
      affectedEdgeIds.add(originalEdge.edgeId);
    }
    const edgeA = createEdge(from, newNode, `进入${businessName}`, "navigate", newNode.domainIds, newNode.roleIds);
    edgeA.createdByChangeSetId = changeSetId;
    const edgeB = createEdge(newNode, to, `完成${businessName}`, "submit", newNode.domainIds, newNode.roleIds);
    edgeB.createdByChangeSetId = changeSetId;
    operations.push(addEdgeOperation(changeSetId, edgeA, instruction));
    operations.push(addEdgeOperation(changeSetId, edgeB, instruction));
    affectedNodeIds.add(from.nodeId).add(to.nodeId).add(newNode.nodeId);
    affectedEdgeIds.add(edgeA.edgeId).add(edgeB.edgeId);
    return plan(flow, changeSetId, instruction, "insertBusiness", operations, affectedNodeIds, affectedEdgeIds);
  }

  if (/(增加|添加|新增).+(功能|按钮|字段|元素)/.test(instruction)) {
    const node = selectedNode ?? findNodeFromInstruction(flow, instruction) ?? activeNodes[0];
    if (!node) {
      return clarificationPlan(flow, changeSetId, instruction, "无法定位要增加功能的节点。");
    }
    const feature = extractFeatureName(instruction, "增加");
    const element: PageElement = {
      elementId: makeElementId(feature, `${node.nodeId}:${feature}:${changeSetId}`),
      name: feature,
      type: inferElementType(feature),
      description: `${node.title}新增${feature}。`,
      required: false
    };
    const action: PageAction = {
      actionId: makeActionId(feature, `${node.nodeId}:${feature}:${changeSetId}`),
      label: feature,
      type: "user",
      result: `执行${feature}`
    };
    operations.push({
      opId: `${changeSetId}_op_add_element`,
      type: "addElement",
      target: { nodeId: node.nodeId, elementId: element.elementId },
      before: null,
      after: element,
      reason: instruction,
      risk: "low",
      requiresConfirmation: false
    });
    if (element.type === "button") {
      operations.push({
        opId: `${changeSetId}_op_add_action`,
        type: "addAction",
        target: { nodeId: node.nodeId, actionId: action.actionId },
        before: null,
        after: action,
        reason: "按钮类元素同步增加页面动作。",
        risk: "low",
        requiresConfirmation: false
      });
    }
    affectedNodeIds.add(node.nodeId);
    return plan(flow, changeSetId, instruction, "addFeature", operations, affectedNodeIds, affectedEdgeIds);
  }

  if (/(移除|删除|去掉).+(功能|按钮|字段|元素)/.test(instruction)) {
    const node = selectedNode ?? findNodeFromInstruction(flow, instruction);
    if (!node) {
      return clarificationPlan(flow, changeSetId, instruction, "无法定位要移除功能的节点。");
    }
    const targetElement =
      node.elements.find((element) => instruction.includes(element.name)) ?? node.elements[node.elements.length - 1];
    if (!targetElement) {
      return clarificationPlan(flow, changeSetId, instruction, `节点 ${node.title} 没有可移除元素。`);
    }
    operations.push({
      opId: `${changeSetId}_op_remove_element`,
      type: "removeElement",
      target: { nodeId: node.nodeId, elementId: targetElement.elementId },
      before: targetElement,
      after: null,
      reason: instruction,
      risk: "medium",
      requiresConfirmation: true
    });
    const targetAction = node.actions.find((action) => action.label === targetElement.name || instruction.includes(action.label));
    if (targetAction) {
      operations.push({
        opId: `${changeSetId}_op_remove_action`,
        type: "removeAction",
        target: { nodeId: node.nodeId, actionId: targetAction.actionId },
        before: targetAction,
        after: null,
        reason: "移除功能时同步移除对应动作。",
        risk: "medium",
        requiresConfirmation: true
      });
    }
    affectedNodeIds.add(node.nodeId);
    return plan(flow, changeSetId, instruction, "removeFeature", operations, affectedNodeIds, affectedEdgeIds);
  }

  if (/(删除|移除).+(节点|页面)/.test(instruction)) {
    const node = selectedNode ?? findNodeFromInstruction(flow, instruction);
    if (!node) {
      return clarificationPlan(flow, changeSetId, instruction, "无法定位要删除的节点。");
    }
    operations.push({
      opId: `${changeSetId}_op_remove_node`,
      type: "removeNode",
      target: { nodeId: node.nodeId },
      before: node,
      after: { ...node, status: "removed", removedByChangeSetId: changeSetId },
      reason: instruction,
      risk: "high",
      requiresConfirmation: true
    });
    for (const edge of flow.edges.filter((item) => item.status === "active" && (item.fromNodeId === node.nodeId || item.toNodeId === node.nodeId))) {
      operations.push({
        opId: `${changeSetId}_op_remove_edge_${edge.edgeId}`,
        type: "removeEdge",
        target: { edgeId: edge.edgeId },
        before: edge,
        after: { ...edge, status: "removed", removedByChangeSetId: changeSetId },
        reason: "删除节点时同步移除相关路径。",
        risk: "high",
        requiresConfirmation: true
      });
      affectedEdgeIds.add(edge.edgeId);
    }
    affectedNodeIds.add(node.nodeId);
    return plan(flow, changeSetId, instruction, "removeNode", operations, affectedNodeIds, affectedEdgeIds);
  }

  return clarificationPlan(flow, changeSetId, instruction, "指令不够明确，请说明要修改的节点、功能和目标结果。");
}

function addEdgeOperation(changeSetId: string, edge: FlowEdge, reason: string): FlowOperation {
  return {
    opId: `${changeSetId}_op_add_edge_${edge.edgeId}`,
    type: "addEdge",
    target: { edgeId: edge.edgeId },
    before: null,
    after: edge,
    reason,
    risk: "low",
    requiresConfirmation: false
  };
}

function plan(
  flow: ProductFlow,
  changeSetId: string,
  instruction: string,
  intent: string,
  operations: FlowOperation[],
  affectedNodeIds: Set<string>,
  affectedEdgeIds: Set<string>
): FlowChangePlan {
  const artifactImpact = buildArtifactImpact(flow, [...affectedNodeIds]);
  return {
    changeSetId,
    flowId: flow.flowId,
    baseRevision: flow.revision,
    instruction,
    intent,
    requiresClarification: false,
    operations,
    affectedNodeIds: [...affectedNodeIds],
    affectedEdgeIds: [...affectedEdgeIds],
    artifactImpact,
    openQuestions: [],
    confidence: 0.74
  };
}

function clarificationPlan(flow: ProductFlow, changeSetId: string, instruction: string, question: string): FlowChangePlan {
  return {
    changeSetId,
    flowId: flow.flowId,
    baseRevision: flow.revision,
    instruction,
    intent: "requiresClarification",
    requiresClarification: true,
    operations: [],
    affectedNodeIds: [],
    affectedEdgeIds: [],
    artifactImpact: [],
    openQuestions: [question],
    confidence: 0.3
  };
}

function buildArtifactImpact(flow: ProductFlow, nodeIds: string[]): ArtifactImpact[] {
  const impacts: ArtifactImpact[] = [];
  for (const nodeId of nodeIds) {
    const node = flow.nodes.find((item) => item.nodeId === nodeId);
    if (!node) {
      continue;
    }
    impacts.push(
      ...node.artifacts.prdIds.map((artifactId) => ({
        artifactId,
        artifactType: "prd" as const,
        status: "stale" as const,
        reason: `节点 ${node.title} 已被修改。`
      })),
      ...node.artifacts.pencilIds.map((artifactId) => ({
        artifactId,
        artifactType: "pencil" as const,
        status: "stale" as const,
        reason: `节点 ${node.title} 已被修改。`
      }))
    );
  }
  return impacts;
}

function findNodeFromInstruction(flow: ProductFlow, instruction: string): PageNode | undefined {
  return flow.nodes
    .filter((node) => node.status === "active")
    .sort((a, b) => b.title.length - a.title.length)
    .find((node) => instruction.includes(node.title) || instruction.includes(node.title.replace(/页$/, "")));
}

function findNode(flow: ProductFlow, text: string): PageNode | undefined {
  const normalized = text.trim().replace(/节点|页面|页/g, "");
  return flow.nodes
    .filter((node) => node.status === "active")
    .find((node) => node.title.includes(normalized) || normalized.includes(node.title.replace(/页$/, "")));
}

function cleanName(value: string): string {
  return value.replace(/[，。,.、\s]+$/g, "").replace(/^(一个|新的)/, "").trim() || "新增业务";
}

function extractFeatureName(instruction: string, verb: string): string {
  const parts = instruction.split(verb);
  const afterVerb = parts[parts.length - 1] ?? instruction;
  const cleaned = afterVerb
    .replace(/功能|按钮|字段|元素|。|，|,/g, "")
    .replace(/^.*?节点/, "")
    .replace(/^.*?页面/, "")
    .trim();
  return cleaned || "新增功能";
}

function inferElementType(feature: string): string {
  if (/按钮|导出|提交|保存|确认|删除|审批/.test(feature)) {
    return "button";
  }
  if (/列表|表格/.test(feature)) {
    return "table";
  }
  if (/上传|附件/.test(feature)) {
    return "upload";
  }
  return "field";
}

function mergeUnique<T>(left: T[], right: T[]): T[] {
  return [...new Set([...left, ...right])];
}

function inferTitle(documentText: string, fallback: string): string {
  const firstHeading = /^#\s+(.+)$/m.exec(documentText);
  return firstHeading?.[1]?.trim() || fallback.replace(/\.(md|txt)$/i, "") || "产品流程";
}

function renderNodePrd(flow: ProductFlow, node: PageNode): string {
  const upstream = flow.edges.filter((edge) => edge.status === "active" && edge.toNodeId === node.nodeId);
  const downstream = flow.edges.filter((edge) => edge.status === "active" && edge.fromNodeId === node.nodeId);
  return `# ${node.title} PRD

## 背景
${node.purpose}

## 目标
为 ${node.title} 提供明确的页面能力、流程入口和输出结果。

## 用户角色
${node.roleIds.join(", ")}

## 业务域
${node.domainIds.join(", ")}

## 范围
本 PRD 覆盖节点 \`${node.nodeId}\`，并说明其上下游关系。

## 用户故事
- 作为相关用户，我希望在 ${node.title} 完成核心任务，从而推进 ${flow.title} 的业务流程。

## 功能需求
${node.actions.map((action) => `- ${action.label}: ${action.result ?? "执行页面动作。"}`).join("\n") || "- 暂无动作。"}

## 页面元素
${node.elements.map((element) => `- ${element.name}: ${element.description}`).join("\n")}

## 业务流程
- 上游：${upstream.map((edge) => `${edge.fromNodeId} / ${edge.action}`).join("; ") || "无"}
- 下游：${downstream.map((edge) => `${edge.toNodeId} / ${edge.action}`).join("; ") || "无"}

## 数据需求
${node.inputs.concat(node.outputs).map((item) => `- ${item}`).join("\n") || "- 根据页面元素定义输入和输出。"}

## 权限与约束
${node.permissions.map((permission) => `- ${permission}`).join("\n")}

## 状态与异常
${node.states.map((state) => `- ${state.name}: ${state.description}`).join("\n")}
${node.exceptions.map((exception) => `- ${exception.name}: ${exception.handling}`).join("\n")}

## 验收标准
- 页面包含所有必需元素。
- 页面动作能按流程连线进入正确下游节点。
- 权限与角色限制生效。

## 埋点建议
- page_view: ${node.nodeId}
- action_click: 记录 actionId 和 nodeId。

## 开放问题
- 需要业务方确认页面字段级校验规则。`;
}

function renderFullPrd(flow: ProductFlow): string {
  const activeNodes = flow.nodes.filter((node) => node.status === "active");
  return `# ${flow.title} 完整 PRD

## 背景
${flow.sourceSummary}

## 目标
建立覆盖全部业务域和角色的产品流程需求说明。

## 用户角色
${flow.roles.map((role) => `- ${role.name}: ${role.description}`).join("\n")}

## 业务域
${flow.domains.map((domain) => `- ${domain.name}: ${domain.description}`).join("\n")}

## 范围
覆盖 ${activeNodes.length} 个页面节点和 ${flow.edges.filter((edge) => edge.status === "active").length} 条业务路径。

## 用户故事
${activeNodes.map((node) => `- 作为 ${node.roleIds.join("/")}，我希望使用 ${node.title} 完成${node.purpose}`).join("\n")}

## 功能需求
${activeNodes.map((node) => `### ${node.title}\n${node.actions.map((action) => `- ${action.label}: ${action.result ?? ""}`).join("\n")}`).join("\n\n")}

## 页面元素
${activeNodes.map((node) => `### ${node.title}\n${node.elements.map((element) => `- ${element.name}: ${element.description}`).join("\n")}`).join("\n\n")}

## 业务流程
${flow.edges.filter((edge) => edge.status === "active").map((edge) => `- ${edge.fromNodeId} -> ${edge.toNodeId}: ${edge.action}${edge.condition ? ` (${edge.condition})` : ""}`).join("\n")}

## 数据需求
- 各页面输入输出以 ProductFlow JSON 中 nodes.inputs 和 nodes.outputs 为准。

## 权限与约束
- 按 ProductFlow JSON 中 roles、domainIds、roleIds 执行权限控制。

## 状态与异常
- 各页面需实现默认态、加载态、错误态和业务异常处理。

## 验收标准
- 所有 active 节点均有页面实现。
- 所有 active 连线均有可触发路径或系统流转。
- 业务域和角色筛选结果与 ProductFlow JSON 一致。

## 埋点建议
- page_view、action_click、flow_transition、artifact_sync_status。

## 开放问题
${flow.openQuestions?.map((item) => `- ${item}`).join("\n") || "- 暂无。"} `;
}

function renderPencilSpec(flow: ProductFlow, nodes: PageNode[]): Record<string, unknown> {
  return {
    designSystem: {
      density: "workbench",
      layout: "responsive",
      cardRadius: 8
    },
    pages: nodes.map((node, index) => ({
      pageId: node.nodeId,
      title: node.title,
      order: index + 1,
      layout: {
        type: "desktop-first",
        regions: ["header", "content", "actionBar"]
      },
      components: node.elements.map((element) => ({
        componentId: element.elementId,
        name: element.name,
        type: element.type,
        description: element.description,
        dataBinding: element.dataBinding
      })),
      interactions: node.actions.map((action) => ({
        actionId: action.actionId,
        label: action.label,
        targetNodeId: action.targetNodeId,
        result: action.result
      })),
      states: node.states,
      exceptions: node.exceptions,
      navigation: flow.edges
        .filter((edge) => edge.status === "active" && edge.fromNodeId === node.nodeId)
        .map((edge) => ({
          edgeId: edge.edgeId,
          action: edge.action,
          toNodeId: edge.toNodeId,
          condition: edge.condition
        })),
      responsive: {
        desktop: "two-column form/detail layout when content is dense",
        tablet: "single-column with persistent action bar",
        mobile: "stacked content with bottom action area"
      }
    }))
  };
}
