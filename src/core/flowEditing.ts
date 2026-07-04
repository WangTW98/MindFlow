import type {
  AppSurface,
  EdgeType,
  FeatureGroup,
  FeatureItem,
  FlowEdge,
  FlowEndpoint,
  PageAction,
  PageElement,
  PageNode,
  ProductFlow
} from "../models/productFlow";
import {
  makeActionId,
  makeEdgeId,
  makeElementId,
  makeFeatureGroupId,
  makeFeatureItemId,
  makeNodeId,
  nowIso,
  shortHash,
  stableKey
} from "../utils/id";

export interface CreateNodeInput {
  title?: string;
  pageType?: string;
  purpose?: string;
  x?: number;
  y?: number;
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
  featureGroups?: FeatureGroup[];
}

export interface UpdateNodeDetailsInput {
  title?: string;
  pageType?: string;
  purpose?: string;
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
  permissions?: string[];
  inputs?: string[];
  outputs?: string[];
  featureGroups?: FeatureGroup[];
}

export interface CreateEdgeInput {
  from: FlowEndpoint;
  to?: FlowEndpoint;
  toNodeId?: string;
  trigger?: string;
  type?: EdgeType;
  condition?: string;
}

export interface UpdateEdgeDetailsInput {
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  trigger?: string;
  action?: string;
  type?: EdgeType;
  condition?: string;
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
}

export function createManualNode(flow: ProductFlow, input: CreateNodeInput = {}): PageNode {
  const title = sanitizeText(input.title, "新建页面");
  const pageType = sanitizeText(input.pageType, "page");
  const purpose = sanitizeText(input.purpose, "手动创建的产品页面节点。");
  const seed = `${flow.flowId}:${title}:${nowIso()}:${flow.nodes.length}`;
  const nodeId = uniqueNodeId(flow, makeNodeId(title, seed));
  const featureGroups = normalizeFeatureGroups(input.featureGroups, nodeId);
  const groups = featureGroups.length > 0 ? featureGroups : defaultFeatureGroups(nodeId);
  const elements = featureGroupsToElements(nodeId, groups);
  const actions = featureGroupsToActions(nodeId, groups);
  const node: PageNode = {
    nodeId,
    stableKey: stableKey(title, purpose, seed),
    status: "active",
    version: 1,
    title,
    pageType,
    appSurfaceIds: normalizeStringArray(input.appSurfaceIds),
    domainIds: normalizeStringArray(input.domainIds),
    roleIds: normalizeStringArray(input.roleIds),
    purpose,
    featureGroups: groups,
    elements,
    actions,
    states: [{ stateId: `state_${stableKey(nodeId, "default")}`, name: "默认态", description: "页面加载并可正常操作。" }],
    exceptions: [{ exceptionId: `ex_${stableKey(nodeId, "manual")}`, name: "异常处理", handling: "按业务规则提示用户并支持重试。" }],
    inputs: [],
    outputs: [],
    permissions: normalizeStringArray(input.roleIds),
    sourceRefs: [{ sourceId: "manual", label: "MindFlow manual edit", excerpt: purpose }],
    artifacts: { prdIds: [], pencilIds: [] },
    view: {
      position: {
        x: Math.round(input.x ?? 80),
        y: Math.round(input.y ?? 80)
      }
    },
    confidence: 1
  };
  flow.nodes.push(node);
  touchFlow(flow);
  return node;
}

export function updateManualNodeDetails(flow: ProductFlow, nodeId: string, patch: UpdateNodeDetailsInput): PageNode {
  const node = requireNode(flow, nodeId);
  if (patch.title !== undefined) {
    node.title = sanitizeText(patch.title, node.title);
  }
  if (patch.pageType !== undefined) {
    node.pageType = sanitizeText(patch.pageType, node.pageType);
  }
  if (patch.purpose !== undefined) {
    node.purpose = sanitizeText(patch.purpose, node.purpose);
  }
  if (patch.appSurfaceIds !== undefined) {
    node.appSurfaceIds = normalizeStringArray(patch.appSurfaceIds);
  }
  if (patch.domainIds !== undefined) {
    node.domainIds = normalizeStringArray(patch.domainIds);
  }
  if (patch.roleIds !== undefined) {
    node.roleIds = normalizeStringArray(patch.roleIds);
  }
  if (patch.permissions !== undefined) {
    node.permissions = normalizeStringArray(patch.permissions);
  }
  if (patch.inputs !== undefined) {
    node.inputs = normalizeStringArray(patch.inputs);
  }
  if (patch.outputs !== undefined) {
    node.outputs = normalizeStringArray(patch.outputs);
  }
  if (patch.featureGroups !== undefined) {
    node.featureGroups = normalizeFeatureGroups(patch.featureGroups, node.nodeId);
    node.elements = featureGroupsToElements(node.nodeId, node.featureGroups);
    node.actions = featureGroupsToActions(node.nodeId, node.featureGroups);
  }
  node.version += 1;
  node.updatedByChangeSetId = "manual";
  markNodeArtifactsStale(flow, node, `节点 ${node.title} 已手动编辑。`);
  touchFlow(flow);
  return node;
}

export function updateManualNodePosition(flow: ProductFlow, nodeId: string, x: number, y: number): PageNode {
  const node = requireNode(flow, nodeId);
  node.view = {
    ...node.view,
    position: {
      x: Math.round(x),
      y: Math.round(y)
    }
  };
  return node;
}

export function updateManualAppSurfacePosition(flow: ProductFlow, appId: string, x: number, y: number): AppSurface {
  const surface = requireAppSurface(flow, appId);
  surface.view = {
    ...surface.view,
    position: {
      x: Math.round(x),
      y: Math.round(y)
    }
  };
  return surface;
}

export function createManualEdge(flow: ProductFlow, input: CreateEdgeInput): FlowEdge {
  const from = normalizeEndpoint(input.from);
  const to = normalizeEndpoint(input.to ?? { kind: "node", nodeId: input.toNodeId ?? "" });
  validateEndpoint(flow, from);
  validateEndpoint(flow, to);
  const trigger = sanitizeText(input.trigger, "手动连接");
  const fromId = endpointStorageId(from);
  const toId = endpointStorageId(to);
  const edgeId = uniqueEdgeId(flow, fromId, toId, trigger);
  const edge: FlowEdge = {
    edgeId,
    status: "active",
    fromNodeId: fromId,
    toNodeId: toId,
    from,
    to,
    action: trigger,
    trigger,
    type: input.type ?? "navigate",
    condition: input.condition,
    appSurfaceIds: mergeUnique(endpointAppSurfaceIds(flow, from), endpointAppSurfaceIds(flow, to)),
    domainIds: mergeUnique(endpointDomainIds(flow, from), endpointDomainIds(flow, to)),
    roleIds: mergeUnique(endpointRoleIds(flow, from), endpointRoleIds(flow, to)),
    sourceRefs: [{ sourceId: "manual", label: "MindFlow manual edge", excerpt: `${endpointLabel(flow, from)} -> ${endpointLabel(flow, to)}` }],
    confidence: 1
  };
  flow.edges.push(edge);
  touchFlow(flow);
  return edge;
}

export function updateManualEdgeDetails(flow: ProductFlow, edgeId: string, patch: UpdateEdgeDetailsInput): FlowEdge {
  const edge = requireEdge(flow, edgeId);
  if (patch.from !== undefined) {
    const from = normalizeEndpoint(patch.from);
    validateEndpoint(flow, from);
    edge.from = from;
    edge.fromNodeId = endpointStorageId(from);
  }
  if (patch.to !== undefined) {
    const to = normalizeEndpoint(patch.to);
    validateEndpoint(flow, to);
    edge.to = to;
    edge.toNodeId = endpointStorageId(to);
  }
  if (patch.trigger !== undefined) {
    edge.trigger = typeof patch.trigger === "string" ? patch.trigger.trim() : edge.trigger ?? edge.action;
    edge.action = edge.trigger;
  }
  if (patch.action !== undefined && patch.trigger === undefined) {
    edge.action = sanitizeText(patch.action, edge.action);
    edge.trigger = edge.action;
  }
  if (patch.type !== undefined) {
    edge.type = patch.type;
  }
  if (patch.condition !== undefined) {
    edge.condition = patch.condition.trim() || undefined;
  }
  if (patch.appSurfaceIds !== undefined) {
    edge.appSurfaceIds = normalizeStringArray(patch.appSurfaceIds);
  }
  if (patch.domainIds !== undefined) {
    edge.domainIds = normalizeStringArray(patch.domainIds);
  }
  if (patch.roleIds !== undefined) {
    edge.roleIds = normalizeStringArray(patch.roleIds);
  }
  edge.updatedByChangeSetId = "manual";
  touchFlow(flow);
  return edge;
}

export function removeManualEdge(flow: ProductFlow, edgeId: string): FlowEdge {
  const edge = requireEdge(flow, edgeId);
  markManualEdgeRemoved(edge);
  touchFlow(flow);
  return edge;
}

export interface RemoveNodeResult {
  node: PageNode;
  removedEdges: FlowEdge[];
}

export function removeManualNode(flow: ProductFlow, nodeId: string): RemoveNodeResult {
  const node = requireNode(flow, nodeId);
  node.status = "removed";
  node.version += 1;
  node.removedAt = nowIso();
  node.removedByChangeSetId = "manual";
  node.updatedByChangeSetId = "manual";
  markNodeArtifactsStale(flow, node, `节点 ${node.title} 已手动删除。`);

  const removedEdges: FlowEdge[] = [];
  for (const edge of flow.edges) {
    if (edge.status === "active" && edgeReferencesNode(edge, node.nodeId)) {
      markManualEdgeRemoved(edge);
      removedEdges.push(edge);
    }
  }
  touchFlow(flow);
  return { node, removedEdges };
}

export function deriveFeatureGroups(node: PageNode): FeatureGroup[] {
  const normalized = normalizeFeatureGroups(node.featureGroups, node.nodeId);
  if (normalized.length > 0) {
    return normalized;
  }
  if (node.elements.length === 0) {
    return [];
  }
  return [
    {
      groupId: makeFeatureGroupId("页面元素", `${node.nodeId}:legacy-elements`),
      name: "页面元素",
      type: "legacyElements",
      description: "由旧版页面元素字段兼容生成。",
      items: node.elements.map((element) => ({
        itemId: makeFeatureItemId(element.name, `${node.nodeId}:${element.elementId}`),
        name: element.name,
        type: element.type,
        description: element.description,
        dataBinding: element.dataBinding,
        required: element.required
      }))
    }
  ];
}

function normalizeFeatureGroups(value: unknown, nodeId: string): FeatureGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((group, groupIndex) => {
      const name = sanitizeText(group.name, `功能分组 ${groupIndex + 1}`);
      const groupId = typeof group.groupId === "string" && group.groupId.trim()
        ? group.groupId.trim()
        : makeFeatureGroupId(name, `${nodeId}:${groupIndex}:${name}`);
      const items = Array.isArray(group.items) ? group.items.filter(isRecord).map((item, itemIndex) => normalizeFeatureItem(item, nodeId, groupId, itemIndex)) : [];
      const actions = Array.isArray(group.actions) ? group.actions.filter(isRecord).map((action, actionIndex) => normalizeAction(action, nodeId, groupId, actionIndex)) : undefined;
      return {
        groupId,
        name,
        type: sanitizeText(group.type, "section"),
        description: sanitizeText(group.description, ""),
        items,
        actions
      };
    });
}

function normalizeFeatureItem(item: Record<string, unknown>, nodeId: string, groupId: string, itemIndex: number): FeatureItem {
  const name = sanitizeText(item.name, `功能项 ${itemIndex + 1}`);
  return {
    itemId: typeof item.itemId === "string" && item.itemId.trim()
      ? item.itemId.trim()
      : makeFeatureItemId(name, `${nodeId}:${groupId}:${itemIndex}:${name}`),
    name,
    type: sanitizeText(item.type, "text"),
    description: sanitizeText(item.description, ""),
    dataBinding: typeof item.dataBinding === "string" ? item.dataBinding : undefined,
    required: typeof item.required === "boolean" ? item.required : undefined
  };
}

function normalizeAction(action: Record<string, unknown>, nodeId: string, groupId: string, actionIndex: number): PageAction {
  const label = sanitizeText(action.label, `操作 ${actionIndex + 1}`);
  return {
    actionId: typeof action.actionId === "string" && action.actionId.trim()
      ? action.actionId.trim()
      : makeActionId(label, `${nodeId}:${groupId}:${actionIndex}:${label}`),
    label,
    type: sanitizeText(action.type, "user"),
    targetNodeId: typeof action.targetNodeId === "string" ? action.targetNodeId : undefined,
    preconditions: normalizeStringArray(action.preconditions),
    result: typeof action.result === "string" ? action.result : undefined
  };
}

function featureGroupsToElements(nodeId: string, groups: FeatureGroup[]): PageElement[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      elementId: makeElementId(item.name, `${nodeId}:${group.groupId}:${item.itemId}`),
      name: item.name,
      type: item.type,
      description: item.description,
      dataBinding: item.dataBinding,
      required: item.required
    }))
  );
}

function featureGroupsToActions(nodeId: string, groups: FeatureGroup[]): PageAction[] {
  const explicit = groups.flatMap((group) => group.actions ?? []);
  const inferred = groups.flatMap((group) =>
    group.items
      .filter((item) => /button|按钮|action|submit|reset|create|delete/i.test(item.type) || /按钮$/.test(item.name))
      .map((item) => ({
        actionId: makeActionId(item.name, `${nodeId}:${group.groupId}:${item.itemId}`),
        label: item.name,
        type: "user",
        result: item.description
      }))
  );
  return [...explicit, ...inferred];
}

function defaultFeatureGroups(nodeId: string): FeatureGroup[] {
  const groupId = makeFeatureGroupId("基础功能", `${nodeId}:default`);
  return [
    {
      groupId,
      name: "基础功能",
      type: "section",
      description: "页面默认功能分组，可在右侧详情栏编辑。",
      items: [
        {
          itemId: makeFeatureItemId("主要内容", `${nodeId}:${groupId}:content`),
          name: "主要内容",
          type: "content",
          description: "承载此页面的核心业务内容。"
        },
        {
          itemId: makeFeatureItemId("确认按钮", `${nodeId}:${groupId}:confirm`),
          name: "确认按钮",
          type: "button",
          description: "触发页面主要业务操作。"
        }
      ]
    }
  ];
}

function normalizeEndpoint(endpoint: FlowEndpoint): FlowEndpoint {
  if (endpoint.kind === "appSurface") {
    const appId = endpoint.appId ?? endpoint.nodeId;
    return {
      kind: "appSurface",
      nodeId: appId,
      appId
    };
  }
  return {
    kind: endpoint.kind,
    nodeId: endpoint.nodeId,
    groupId: endpoint.groupId,
    itemId: endpoint.itemId
  };
}

function validateEndpoint(flow: ProductFlow, endpoint: FlowEndpoint): void {
  if (endpoint.kind === "appSurface") {
    requireAppSurface(flow, endpoint.appId ?? endpoint.nodeId);
    return;
  }
  const node = requireNode(flow, endpoint.nodeId);
  if (endpoint.kind === "node") {
    return;
  }
  if (!endpoint.groupId) {
    throw new Error("Feature endpoint requires groupId.");
  }
  const group = deriveFeatureGroups(node).find((item) => item.groupId === endpoint.groupId);
  if (!group) {
    throw new Error(`Missing feature group: ${endpoint.groupId}`);
  }
  if (endpoint.kind === "featureGroup") {
    return;
  }
  if (!endpoint.itemId) {
    throw new Error("Feature item endpoint requires itemId.");
  }
  if (!group.items.some((item) => item.itemId === endpoint.itemId)) {
    throw new Error(`Missing feature item: ${endpoint.itemId}`);
  }
}

function endpointLabel(flow: ProductFlow, endpoint: FlowEndpoint): string {
  if (endpoint.kind === "appSurface") {
    const appId = endpoint.appId ?? endpoint.nodeId;
    return flow.appSurfaces?.find((surface) => surface.appId === appId)?.name ?? appId;
  }
  if (endpoint.kind === "node") {
    return endpoint.nodeId;
  }
  if (endpoint.kind === "featureGroup") {
    return `${endpoint.nodeId}/${endpoint.groupId ?? ""}`;
  }
  return `${endpoint.nodeId}/${endpoint.groupId ?? ""}/${endpoint.itemId ?? ""}`;
}

function endpointStorageId(endpoint: FlowEndpoint): string {
  return endpoint.kind === "appSurface" ? endpoint.appId ?? endpoint.nodeId : endpoint.nodeId;
}

function endpointAppSurfaceIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "appSurface") {
    return [endpoint.appId ?? endpoint.nodeId];
  }
  return requireNode(flow, endpoint.nodeId).appSurfaceIds ?? [];
}

function endpointDomainIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "appSurface") {
    return requireAppSurface(flow, endpoint.appId ?? endpoint.nodeId).domainIds;
  }
  return requireNode(flow, endpoint.nodeId).domainIds;
}

function endpointRoleIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "appSurface") {
    return requireAppSurface(flow, endpoint.appId ?? endpoint.nodeId).roleIds;
  }
  return requireNode(flow, endpoint.nodeId).roleIds;
}

function edgeReferencesNode(edge: FlowEdge, nodeId: string): boolean {
  const from = edge.from ?? { kind: "node", nodeId: edge.fromNodeId };
  const to = edge.to ?? { kind: "node", nodeId: edge.toNodeId };
  return (from.kind !== "appSurface" && from.nodeId === nodeId) || (to.kind !== "appSurface" && to.nodeId === nodeId);
}

function requireNode(flow: ProductFlow, nodeId: string | undefined): PageNode {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new Error(`Missing node: ${nodeId ?? ""}`);
  }
  return node;
}

function requireAppSurface(flow: ProductFlow, appId: string | undefined): AppSurface {
  const surface = flow.appSurfaces?.find((item) => item.appId === appId);
  if (!surface) {
    throw new Error(`Missing app surface: ${appId ?? ""}`);
  }
  return surface;
}

function requireEdge(flow: ProductFlow, edgeId: string | undefined): FlowEdge {
  const edge = flow.edges.find((item) => item.edgeId === edgeId);
  if (!edge) {
    throw new Error(`Missing edge: ${edgeId ?? ""}`);
  }
  return edge;
}

function uniqueNodeId(flow: ProductFlow, baseId: string): string {
  if (!flow.nodes.some((node) => node.nodeId === baseId)) {
    return baseId;
  }
  return `${baseId}_${shortHash(`${baseId}:${nowIso()}:${flow.nodes.length}`, 4)}`;
}

function uniqueEdgeId(flow: ProductFlow, fromNodeId: string, toNodeId: string, trigger: string): string {
  const baseId = makeEdgeId(fromNodeId, toNodeId, `${trigger}:${nowIso()}:${flow.edges.length}`);
  if (!flow.edges.some((edge) => edge.edgeId === baseId)) {
    return baseId;
  }
  return `edge_${shortHash(`${baseId}:${nowIso()}`, 12)}`;
}

function markNodeArtifactsStale(flow: ProductFlow, node: PageNode, reason: string): void {
  const now = nowIso();
  for (const prd of flow.artifacts.prds) {
    if (node.artifacts.prdIds.includes(prd.prdId)) {
      prd.status = "stale";
      prd.staleReason = reason;
      prd.staleByChangeSetId = "manual";
      prd.updatedAt = now;
    }
  }
  for (const pencil of flow.artifacts.pencils) {
    if (node.artifacts.pencilIds.includes(pencil.pencilId)) {
      pencil.status = "stale";
      pencil.staleReason = reason;
      pencil.staleByChangeSetId = "manual";
      pencil.updatedAt = now;
    }
  }
}

function markManualEdgeRemoved(edge: FlowEdge): void {
  edge.status = "removed";
  edge.removedAt = nowIso();
  edge.removedByChangeSetId = "manual";
  edge.updatedByChangeSetId = "manual";
}

function touchFlow(flow: ProductFlow): void {
  flow.revision += 1;
  flow.updatedAt = nowIso();
}

function sanitizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function mergeUnique(...arrays: string[][]): string[] {
  return Array.from(new Set(arrays.flat().filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
