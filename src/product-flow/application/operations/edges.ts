import { createFlowEdge, removeFlowEdge, updateFlowEdgeDetails, type UpdateEdgeDetailsInput } from "../../domain/editing/graph";
import type { FlowEdge, FlowEndpoint, ProductFlow } from "../../domain";
import { stripUndefined } from "./helpers";
import type { FlowOperation, FlowOperationResult, UpsertEdgeOperationInput } from "./types";

type EdgeOperation = Extract<FlowOperation, { type: "edge.upsert" | "edge.update" | "edge.remove" }>;

export function applyEdgeOperation(flow: ProductFlow, operation: EdgeOperation): FlowOperationResult {
  if (operation.type === "edge.upsert") {
    const result = upsertEdgeInFlow(flow, operation.input);
    return {
      type: operation.type,
      ...result,
      selection: { selectedProjectOverview: false, selectedEdgeId: result.edge.edgeId }
    };
  }
  if (operation.type === "edge.update") {
    const edge = updateFlowEdgeDetails(flow, operation.edgeId, operation.patch);
    return {
      type: operation.type,
      edge,
      selection: { selectedProjectOverview: false, selectedEdgeId: edge.edgeId }
    };
  }
  const edge = removeFlowEdge(flow, operation.edgeId);
  return {
    type: operation.type,
    removedEdgeId: edge.edgeId,
    edge,
    selection: { selectedProjectOverview: false }
  };
}

function upsertEdgeInFlow(flow: ProductFlow, input: UpsertEdgeOperationInput): { edge: FlowEdge; mode: "created" | "updated" | "updatedExisting" } {
  const edgeId = input.edgeId ?? input.id;
  const existing = edgeId ? flow.edges.find((edge) => edge.edgeId === edgeId) : undefined;
  const from = input.from ?? (existing ? edgeEndpoint(existing, "from") : undefined);
  const to = input.to ?? (existing ? edgeEndpoint(existing, "to") : undefined);
  if (!from || !to) {
    throw new Error("Edge requires both from and to endpoints.");
  }
  const type = input.type ?? existing?.type ?? "interaction";
  const conflict = findSameEndpointEdge(flow, from, to, edgeId);
  const patch: UpdateEdgeDetailsInput = stripUndefined({
    from,
    to,
    trigger: input.trigger ?? input.action,
    action: input.action,
    type,
    condition: input.condition,
    appSurfaceIds: input.appSurfaceIds,
    domainIds: input.domainIds,
    roleIds: input.roleIds
  });
  if (conflict) {
    if (conflict.type !== type) {
      throw new Error(`Refusing duplicate endpoints with different edge type. Existing edge ${conflict.edgeId} uses ${conflict.type}.`);
    }
    return { edge: updateFlowEdgeDetails(flow, conflict.edgeId, patch), mode: "updatedExisting" };
  }
  if (existing) {
    return { edge: updateFlowEdgeDetails(flow, existing.edgeId, patch), mode: "updated" };
  }
  const edge = createFlowEdge(flow, {
    from,
    to,
    trigger: patch.trigger,
    type,
    condition: patch.condition
  });
  const detailPatch: UpdateEdgeDetailsInput = stripUndefined({
    condition: patch.condition,
    appSurfaceIds: patch.appSurfaceIds,
    domainIds: patch.domainIds,
    roleIds: patch.roleIds
  });
  if (Object.keys(detailPatch).length > 0) {
    updateFlowEdgeDetails(flow, edge.edgeId, detailPatch);
  }
  return { edge, mode: "created" };
}

function findSameEndpointEdge(flow: ProductFlow, from: FlowEndpoint, to: FlowEndpoint, exceptEdgeId?: string): FlowEdge | undefined {
  return flow.edges.find((edge) =>
    edge.status === "active" &&
    edge.edgeId !== exceptEdgeId &&
    endpointKey(edgeEndpoint(edge, "from")) === endpointKey(from) &&
    endpointKey(edgeEndpoint(edge, "to")) === endpointKey(to)
  );
}

function edgeEndpoint(edge: FlowEdge, side: "from" | "to"): FlowEndpoint {
  const endpoint = side === "from" ? edge.from : edge.to;
  return endpoint ?? { kind: "node", nodeId: side === "from" ? edge.fromNodeId : edge.toNodeId };
}

function endpointKey(endpoint: FlowEndpoint): string {
  return [endpoint.kind, endpoint.nodeId, endpoint.appId ?? "", endpoint.groupId ?? "", endpoint.itemId ?? ""].join("|");
}
