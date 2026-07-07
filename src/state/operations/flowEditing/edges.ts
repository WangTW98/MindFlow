import type { FlowEdge, ProductFlow } from "../../product-flow";
import { nowIso } from "../../id";
import { edgeReferencesNode, endpointAppSurfaceIds, endpointDomainIds, endpointRoleIds, endpointStorageId, normalizeEndpoint, validateEndpoint } from "./endpoints";
import {
  markManualEdgeRemoved,
  mergeUnique,
  normalizeStringArray,
  requireEdge,
  requireEdgeType,
  requireNode,
  sanitizeText,
  touchFlow,
  uniqueEdgeId
} from "./shared";
import type { CreateEdgeInput, RemoveNodeResult, UpdateEdgeDetailsInput } from "./types";

export function createFlowEdge(flow: ProductFlow, input: CreateEdgeInput): FlowEdge {
  const from = normalizeEndpoint(input.from);
  const to = normalizeEndpoint(input.to ?? { kind: "node", nodeId: input.toNodeId ?? "" });
  validateEndpoint(flow, from);
  validateEndpoint(flow, to);
  const trigger = sanitizeText(input.trigger, "连接");
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
    type: input.type === undefined ? "interaction" : requireEdgeType(input.type),
    condition: input.condition,
    appSurfaceIds: mergeUnique(endpointAppSurfaceIds(flow, from), endpointAppSurfaceIds(flow, to)),
    domainIds: mergeUnique(endpointDomainIds(flow, from), endpointDomainIds(flow, to)),
    roleIds: mergeUnique(endpointRoleIds(flow, from), endpointRoleIds(flow, to))
  };
  flow.edges.push(edge);
  touchFlow(flow);
  return edge;
}

export function createManualEdge(flow: ProductFlow, input: CreateEdgeInput): FlowEdge {
  return createFlowEdge(flow, input);
}

export function updateFlowEdgeDetails(flow: ProductFlow, edgeId: string, patch: UpdateEdgeDetailsInput): FlowEdge {
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
    edge.type = requireEdgeType(patch.type);
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
  touchFlow(flow);
  return edge;
}

export function updateManualEdgeDetails(flow: ProductFlow, edgeId: string, patch: UpdateEdgeDetailsInput): FlowEdge {
  return updateFlowEdgeDetails(flow, edgeId, patch);
}

export function removeFlowEdge(flow: ProductFlow, edgeId: string): FlowEdge {
  const edge = requireEdge(flow, edgeId);
  markManualEdgeRemoved(edge);
  touchFlow(flow);
  return edge;
}

export function removeManualEdge(flow: ProductFlow, edgeId: string): FlowEdge {
  return removeFlowEdge(flow, edgeId);
}

export function removeFlowNode(flow: ProductFlow, nodeId: string): RemoveNodeResult {
  const node = requireNode(flow, nodeId);
  node.status = "removed";
  node.version += 1;
  node.removedAt = nowIso();

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

export function removeManualNode(flow: ProductFlow, nodeId: string): RemoveNodeResult {
  return removeFlowNode(flow, nodeId);
}
