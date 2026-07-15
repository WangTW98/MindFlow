import type { AppSurface, FlowEdge, PageNode, ProductFlow } from "../..";
import { makeEdgeId, nowIso } from "../../id";

export interface EnsureAppSurfaceEntryEdgesResult {
  addedEdgeIds: string[];
}

export function ensureAppSurfaceEntryEdges(flow: ProductFlow): EnsureAppSurfaceEntryEdgesResult {
  const addedEdgeIds: string[] = [];
  const activeNodes = flow.nodes.filter((node) => node.status === "active");
  const activeEdges = flow.edges.filter((edge) => edge.status === "active");

  for (const surface of flow.appSurfaces ?? []) {
    const entryNode = selectEntryNodeForSurface(surface, activeNodes);
    if (!entryNode) {
      continue;
    }
    const hasEntryEdge = activeEdges.some((edge) =>
      edge.from.kind === "appSurface" &&
      edge.from.appId === surface.appId &&
      edge.toNodeId === entryNode.nodeId
    );
    if (hasEntryEdge) {
      continue;
    }
    const edge = createAppSurfaceEntryEdge(surface, entryNode);
    flow.edges.push(edge);
    activeEdges.push(edge);
    addedEdgeIds.push(edge.edgeId);
  }

  if (addedEdgeIds.length > 0) {
    flow.revision += 1;
    flow.updatedAt = nowIso();
  }
  return { addedEdgeIds };
}

function selectEntryNodeForSurface(surface: AppSurface, activeNodes: PageNode[]): PageNode | undefined {
  const skeletons = activeNodes.filter((node) =>
    node.pageType === "skeleton" && (node.appSurfaceIds ?? []).includes(surface.appId)
  );
  return skeletons.length === 1 ? skeletons[0] : undefined;
}

function createAppSurfaceEntryEdge(surface: AppSurface, node: PageNode): FlowEdge {
  const trigger = `进入${surface.name}`;
  return {
    edgeId: makeEdgeId(surface.appId, node.nodeId, trigger),
    status: "active",
    fromNodeId: surface.appId,
    toNodeId: node.nodeId,
    from: { kind: "appSurface", nodeId: surface.appId, appId: surface.appId },
    to: { kind: "node", nodeId: node.nodeId },
    action: trigger,
    trigger,
    type: "nestedRelation",
    appSurfaceIds: [surface.appId],
    domainIds: mergeUnique(surface.domainIds, node.domainIds),
    roleIds: mergeUnique(surface.roleIds, node.roleIds)
  };
}

function mergeUnique(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].filter(Boolean)));
}
