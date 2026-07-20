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
    condition: input.condition
  });
  if (conflict) {
    if (edgeId && conflict.edgeId !== edgeId) {
      throw new Error(`Edge id ${edgeId} cannot replace existing edge ${conflict.edgeId} with the same endpoints.`);
    }
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
  if (edgeId) {
    edge.edgeId = edgeId;
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
  return side === "from" ? edge.from : edge.to;
}

function endpointKey(endpoint: FlowEndpoint): string {
  const appId = endpoint.kind === "appSurface" ? endpoint.appId : "";
  const groupId = endpoint.kind === "featureGroup" || endpoint.kind === "featureItem" ? endpoint.groupId : "";
  const itemId = endpoint.kind === "featureItem" ? endpoint.itemId : "";
  return [endpoint.kind, endpoint.nodeId, appId, groupId, itemId].join("|");
}
