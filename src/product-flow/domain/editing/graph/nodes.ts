import { NODE_PAGE_TYPES, type AppSurface, type NodePageType, type PageNode, type ProductFlow } from "../..";
import { makeNodeId, nowIso } from "../../id";
import { defaultFeatureGroups, normalizeFeatureGroups } from "./featureGroups";
import { refreshAllFlowEdgeDerivedState } from "./edges";
import { normalizeStringArray, requireAppSurface, requireNode, sanitizeText, touchFlow, uniqueNodeId } from "./shared";
import type { CreateNodeInput, UpdateNodeDetailsInput } from "./types";

export function createFlowNode(flow: ProductFlow, input: CreateNodeInput = {}): PageNode {
  const title = sanitizeText(input.title, "新建页面");
  const pageType = requireNodePageType(input.pageType ?? "page");
  const purpose = sanitizeText(input.purpose, "新建产品页面节点。");
  const seed = `${flow.flowId}:${title}:${nowIso()}:${flow.nodes.length}`;
  const requestedNodeId = typeof input.nodeId === "string" ? input.nodeId.trim() : "";
  if (requestedNodeId && flow.nodes.some((node) => node.nodeId === requestedNodeId)) {
    throw new Error(`Node already exists: ${requestedNodeId}`);
  }
  const nodeId = requestedNodeId || uniqueNodeId(flow, makeNodeId(title, seed));
  const featureGroups = normalizeFeatureGroups(input.featureGroups, nodeId);
  const groups = featureGroups.length > 0 ? featureGroups : defaultFeatureGroups(nodeId);
  const hasExplicitPosition = Number.isFinite(input.x) || Number.isFinite(input.y);
  const node: PageNode = {
    nodeId,
    status: "active",
    title,
    pageType,
    appSurfaceIds: normalizeStringArray(input.appSurfaceIds),
    domainIds: normalizeStringArray(input.domainIds),
    roleIds: normalizeStringArray(input.roleIds),
    purpose,
    featureGroups: groups,
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

export function updateFlowNodeDetails(flow: ProductFlow, nodeId: string, patch: UpdateNodeDetailsInput): PageNode {
  const node = requireNode(flow, nodeId);
  if (patch.title !== undefined) {
    node.title = sanitizeText(patch.title, node.title);
  }
  if (patch.pageType !== undefined) {
    node.pageType = requireNodePageType(patch.pageType);
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
  }
  refreshAllFlowEdgeDerivedState(flow);
  touchFlow(flow);
  return node;
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

function assertFiniteCoordinates(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Position coordinates must be finite numbers.");
  }
}

function finiteCoordinateOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function requireNodePageType(value: string): NodePageType {
  if ((NODE_PAGE_TYPES as readonly string[]).includes(value)) {
    return value as NodePageType;
  }
  throw new Error(`Node pageType must be ${NODE_PAGE_TYPES.join(", ")}.`);
}
