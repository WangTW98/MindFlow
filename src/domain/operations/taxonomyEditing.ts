import type { FlowEdge, FlowEndpoint, ProductFlow } from "../product-flow";

export interface DeleteAppSurfaceResult {
  removedEdgeIds: string[];
}

export function deleteAppSurface(flow: ProductFlow, appId: string): DeleteAppSurfaceResult {
  flow.appSurfaces = (flow.appSurfaces ?? []).filter((item) => item.appId !== appId);
  for (const node of flow.nodes) {
    node.appSurfaceIds = (node.appSurfaceIds ?? []).filter((id) => id !== appId);
  }

  const removedEdgeIds: string[] = [];
  flow.edges = flow.edges.filter((edge) => {
    if (edgeReferencesAppSurfaceEndpoint(edge, appId)) {
      removedEdgeIds.push(edge.edgeId);
      return false;
    }
    edge.appSurfaceIds = (edge.appSurfaceIds ?? []).filter((id) => id !== appId);
    return true;
  });

  return { removedEdgeIds };
}

export function pruneMissingAppSurfaceReferences(flow: ProductFlow): DeleteAppSurfaceResult {
  const appSurfaceIds = new Set((flow.appSurfaces ?? []).map((surface) => surface.appId));
  const nodeIds = new Set(flow.nodes.map((node) => node.nodeId));
  for (const node of flow.nodes) {
    node.appSurfaceIds = (node.appSurfaceIds ?? []).filter((id) => appSurfaceIds.has(id));
  }

  const removedEdgeIds: string[] = [];
  flow.edges = flow.edges.filter((edge) => {
    if (edgeHasMissingAppSurfaceEndpoint(edge, appSurfaceIds, nodeIds)) {
      removedEdgeIds.push(edge.edgeId);
      return false;
    }
    edge.appSurfaceIds = (edge.appSurfaceIds ?? []).filter((id) => appSurfaceIds.has(id));
    return true;
  });

  return { removedEdgeIds };
}

function edgeReferencesAppSurfaceEndpoint(edge: FlowEdge, appId: string): boolean {
  return endpointReferencesAppSurface(edge.from, appId) ||
    endpointReferencesAppSurface(edge.to, appId) ||
    (!edge.from && edge.fromNodeId === appId) ||
    (!edge.to && edge.toNodeId === appId);
}

function endpointReferencesAppSurface(endpoint: FlowEndpoint | undefined, appId: string): boolean {
  return Boolean(endpoint && endpoint.kind === "appSurface" && (endpoint.appId ?? endpoint.nodeId) === appId);
}

function edgeHasMissingAppSurfaceEndpoint(edge: FlowEdge, appSurfaceIds: Set<string>, nodeIds: Set<string>): boolean {
  return endpointReferencesMissingAppSurface(edge.from, appSurfaceIds) ||
    endpointReferencesMissingAppSurface(edge.to, appSurfaceIds) ||
    legacyEndpointReferencesMissingAppSurface(edge.from, edge.fromNodeId, appSurfaceIds, nodeIds) ||
    legacyEndpointReferencesMissingAppSurface(edge.to, edge.toNodeId, appSurfaceIds, nodeIds);
}

function endpointReferencesMissingAppSurface(endpoint: FlowEndpoint | undefined, appSurfaceIds: Set<string>): boolean {
  if (!endpoint || endpoint.kind !== "appSurface") {
    return false;
  }
  const appId = endpoint.appId ?? endpoint.nodeId;
  return !appSurfaceIds.has(appId);
}

function legacyEndpointReferencesMissingAppSurface(
  endpoint: FlowEndpoint | undefined,
  storageId: string,
  appSurfaceIds: Set<string>,
  nodeIds: Set<string>
): boolean {
  if (endpoint || nodeIds.has(storageId)) {
    return false;
  }
  return storageId.startsWith("app_") && !appSurfaceIds.has(storageId);
}
