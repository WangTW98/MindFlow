import type { FlowEdge, ProductFlow } from "../..";
import { nowIso } from "../../id";
import { edgeReferencesNode, endpointAppSurfaceIds, endpointDomainIds, endpointRoleIds, endpointStorageId, normalizeEndpoint, validateEndpoint } from "./endpoints";
import {
  markFlowEdgeRemoved,
  mergeUnique,
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
  const type = input.type === undefined ? "interaction" : requireEdgeType(input.type);
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
    type,
    condition: input.condition,
    appSurfaceIds: mergeUnique(endpointAppSurfaceIds(flow, from), endpointAppSurfaceIds(flow, to)),
    domainIds: mergeUnique(endpointDomainIds(flow, from), endpointDomainIds(flow, to)),
    roleIds: mergeUnique(endpointRoleIds(flow, from), endpointRoleIds(flow, to))
  };
  flow.edges.push(edge);
  touchFlow(flow);
  return edge;
}

export function updateFlowEdgeDetails(flow: ProductFlow, edgeId: string, patch: UpdateEdgeDetailsInput): FlowEdge {
  const edge = requireEdge(flow, edgeId);
  const nextFrom = patch.from === undefined ? edge.from : normalizeEndpoint(patch.from);
  const nextType = patch.type === undefined ? edge.type : requireEdgeType(patch.type);
  validateEndpoint(flow, nextFrom);
  if (patch.from !== undefined) {
    edge.from = nextFrom;
    edge.fromNodeId = endpointStorageId(nextFrom);
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
    edge.type = nextType;
  }
  if (patch.condition !== undefined) {
    edge.condition = patch.condition.trim() || undefined;
  }
  refreshFlowEdgeDerivedState(flow, edge);
  touchFlow(flow);
  return edge;
}


export function refreshFlowEdgeDerivedState(flow: ProductFlow, edge: FlowEdge): FlowEdge {
  edge.fromNodeId = endpointStorageId(edge.from);
  edge.toNodeId = endpointStorageId(edge.to);
  edge.appSurfaceIds = mergeUnique(endpointAppSurfaceIds(flow, edge.from), endpointAppSurfaceIds(flow, edge.to));
  edge.domainIds = mergeUnique(endpointDomainIds(flow, edge.from), endpointDomainIds(flow, edge.to));
  edge.roleIds = mergeUnique(endpointRoleIds(flow, edge.from), endpointRoleIds(flow, edge.to));
  return edge;
}

export function refreshAllFlowEdgeDerivedState(flow: ProductFlow): void {
  for (const edge of flow.edges) {
    refreshFlowEdgeDerivedState(flow, edge);
  }
}

export function removeFlowEdge(flow: ProductFlow, edgeId: string): FlowEdge {
  const edge = requireEdge(flow, edgeId);
  markFlowEdgeRemoved(edge);
  touchFlow(flow);
  return edge;
}

export function removeFlowNode(flow: ProductFlow, nodeId: string): RemoveNodeResult {
  const node = requireNode(flow, nodeId);
  node.status = "removed";
  node.removedAt = nowIso();

  const removedEdges: FlowEdge[] = [];
  for (const edge of flow.edges) {
    if (edge.status === "active" && edgeReferencesNode(edge, node.nodeId)) {
      markFlowEdgeRemoved(edge);
      removedEdges.push(edge);
    }
  }
  touchFlow(flow);
  return { node, removedEdges };
}
