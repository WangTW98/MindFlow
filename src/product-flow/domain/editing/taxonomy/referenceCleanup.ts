import type { FlowEdge, FlowEndpoint, ProductFlow } from "../..";
import { refreshAllFlowEdgeDerivedState } from "../graph/edges";

import { nowIso } from "../../id";

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

  refreshAllFlowEdgeDerivedState(flow);

  return { removedEdgeIds };
}

export function pruneMissingAppSurfaceReferences(flow: ProductFlow): DeleteAppSurfaceResult {
  const appSurfaceIds = new Set((flow.appSurfaces ?? []).map((surface) => surface.appId));
  for (const node of flow.nodes) {
    node.appSurfaceIds = (node.appSurfaceIds ?? []).filter((id) => appSurfaceIds.has(id));
  }

  const removedEdgeIds: string[] = [];
  flow.edges = flow.edges.filter((edge) => {
    if (edgeHasMissingAppSurfaceEndpoint(edge, appSurfaceIds)) {
      removedEdgeIds.push(edge.edgeId);
      return false;
    }
    edge.appSurfaceIds = (edge.appSurfaceIds ?? []).filter((id) => appSurfaceIds.has(id));
    return true;
  });

  refreshAllFlowEdgeDerivedState(flow);

  return { removedEdgeIds };
}

function edgeReferencesAppSurfaceEndpoint(edge: FlowEdge, appId: string): boolean {
  return endpointReferencesAppSurface(edge.from, appId) ||
    endpointReferencesAppSurface(edge.to, appId);
}

function endpointReferencesAppSurface(endpoint: FlowEndpoint | undefined, appId: string): boolean {
  return Boolean(endpoint && endpoint.kind === "appSurface" && endpoint.appId === appId);
}

function edgeHasMissingAppSurfaceEndpoint(edge: FlowEdge, appSurfaceIds: Set<string>): boolean {
  return endpointReferencesMissingAppSurface(edge.from, appSurfaceIds) ||
    endpointReferencesMissingAppSurface(edge.to, appSurfaceIds);
}

function endpointReferencesMissingAppSurface(endpoint: FlowEndpoint | undefined, appSurfaceIds: Set<string>): boolean {
  if (!endpoint || endpoint.kind !== "appSurface") {
    return false;
  }
  return typeof endpoint.appId !== "string" || !appSurfaceIds.has(endpoint.appId);
}
