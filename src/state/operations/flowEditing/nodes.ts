import type { AppSurface, PageNode, ProductFlow } from "../../product-flow";
import { makeNodeId, nowIso, stableKey } from "../../id";
import { defaultFeatureGroups, featureGroupsToActions, featureGroupsToElements, normalizeFeatureGroups } from "./featureGroups";
import { normalizeStringArray, requireAppSurface, requireNode, sanitizeText, touchFlow, uniqueNodeId } from "./shared";
import type { CreateNodeInput, UpdateNodeDetailsInput } from "./types";

export function createFlowNode(flow: ProductFlow, input: CreateNodeInput = {}): PageNode {
  const title = sanitizeText(input.title, "新建页面");
  const pageType = sanitizeText(input.pageType, "page");
  const purpose = sanitizeText(input.purpose, "新建产品页面节点。");
  const seed = `${flow.flowId}:${title}:${nowIso()}:${flow.nodes.length}`;
  const nodeId = uniqueNodeId(flow, makeNodeId(title, seed));
  const featureGroups = normalizeFeatureGroups(input.featureGroups, nodeId);
  const groups = featureGroups.length > 0 ? featureGroups : defaultFeatureGroups(nodeId);
  const elements = featureGroupsToElements(nodeId, groups);
  const actions = featureGroupsToActions(nodeId, groups);
  const hasExplicitPosition = Number.isFinite(input.x) || Number.isFinite(input.y);
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
    ...(hasExplicitPosition
      ? {
          view: {
            position: {
              x: finiteCoordinateOrDefault(input.x, 80),
              y: finiteCoordinateOrDefault(input.y, 80)
            }
          }
        }
      : {})
  };
  flow.nodes.push(node);
  touchFlow(flow);
  return node;
}

export function createManualNode(flow: ProductFlow, input: CreateNodeInput = {}): PageNode {
  return createFlowNode(flow, input);
}

export function updateFlowNodeDetails(flow: ProductFlow, nodeId: string, patch: UpdateNodeDetailsInput): PageNode {
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
  if (patch.statusGroupId !== undefined) {
    const statusGroupId = typeof patch.statusGroupId === "string" ? patch.statusGroupId.trim() : "";
    if (statusGroupId && (flow.statusGroups || []).some((group) => group.statusGroupId === statusGroupId)) {
      node.statusGroupId = statusGroupId;
    } else {
      delete node.statusGroupId;
    }
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
  touchFlow(flow);
  return node;
}

export function updateManualNodeDetails(flow: ProductFlow, nodeId: string, patch: UpdateNodeDetailsInput): PageNode {
  return updateFlowNodeDetails(flow, nodeId, patch);
}

export function updateFlowNodePosition(flow: ProductFlow, nodeId: string, x: number, y: number): PageNode {
  assertFiniteCoordinates(x, y);
  const node = requireNode(flow, nodeId);
  node.view = {
    ...node.view,
    position: {
      x: Math.round(x),
      y: Math.round(y)
    }
  };
  touchFlow(flow);
  return node;
}

export function updateManualNodePosition(flow: ProductFlow, nodeId: string, x: number, y: number): PageNode {
  return updateFlowNodePosition(flow, nodeId, x, y);
}

export function updateFlowAppSurfacePosition(flow: ProductFlow, appId: string, x: number, y: number): AppSurface {
  assertFiniteCoordinates(x, y);
  const surface = requireAppSurface(flow, appId);
  surface.view = {
    ...surface.view,
    position: {
      x: Math.round(x),
      y: Math.round(y)
    }
  };
  touchFlow(flow);
  return surface;
}

export function updateManualAppSurfacePosition(flow: ProductFlow, appId: string, x: number, y: number): AppSurface {
  return updateFlowAppSurfacePosition(flow, appId, x, y);
}

function assertFiniteCoordinates(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Position coordinates must be finite numbers.");
  }
}

function finiteCoordinateOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}
