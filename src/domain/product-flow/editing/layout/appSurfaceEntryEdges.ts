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
    const entryNode = selectEntryNodeForSurface(surface, activeNodes, activeEdges);
    if (!entryNode) {
      continue;
    }
    const hasEntryEdge = activeEdges.some((edge) =>
      edge.from?.kind === "appSurface" &&
      (edge.from.appId ?? edge.from.nodeId) === surface.appId &&
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

function selectEntryNodeForSurface(surface: AppSurface, activeNodes: PageNode[], activeEdges: FlowEdge[]): PageNode | undefined {
  const surfaceNodes = activeNodes.filter((node) => (node.appSurfaceIds ?? []).includes(surface.appId));
  if (surfaceNodes.length === 0) {
    return undefined;
  }
  const candidates = surfaceNodes.filter((node) => !hasSameSurfaceIncoming(node, surface.appId, activeNodes, activeEdges));
  const pool = candidates.length > 0 ? candidates : surfaceNodes;
  return [...pool].sort((left, right) => scoreEntryNode(surface, right) - scoreEntryNode(surface, left))[0];
}

function hasSameSurfaceIncoming(node: PageNode, appId: string, activeNodes: PageNode[], activeEdges: FlowEdge[]): boolean {
  return activeEdges.some((edge) => {
    if (edge.toNodeId !== node.nodeId || edge.from?.kind === "appSurface") {
      return false;
    }
    const fromNode = activeNodes.find((candidate) => candidate.nodeId === edge.fromNodeId);
    return (fromNode?.appSurfaceIds ?? []).includes(appId);
  });
}

function scoreEntryNode(surface: AppSurface, node: PageNode): number {
  const text = `${node.title} ${node.pageType} ${node.purpose}`.toLowerCase();
  let score = 0;
  if (node.title.includes(surface.name)) {
    score += 50;
  }
  if (/首页|主页|工作台|待办|列表|home|dashboard|workspace|inbox|entry/.test(text)) {
    score += 40;
  }
  if (node.pageType === "home") {
    score += 35;
  } else if (node.pageType === "workspace") {
    score += 30;
  } else if (node.pageType === "list") {
    score += 20;
  }
  if ((node.appSurfaceIds ?? []).length === 1) {
    score += 10;
  }
  return score;
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
    type: "navigate",
    appSurfaceIds: [surface.appId],
    domainIds: mergeUnique(surface.domainIds, node.domainIds),
    roleIds: mergeUnique(surface.roleIds, node.roleIds)
  };
}

function mergeUnique(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].filter(Boolean)));
}
