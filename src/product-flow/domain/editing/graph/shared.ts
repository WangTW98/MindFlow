import type { AppSurface, EdgeType, FlowEdge, PageNode, ProductFlow } from "../..";
import { isEdgeType } from "../..";
import { makeEdgeId, nowIso, shortHash } from "../../id";

export function requireNode(flow: ProductFlow, nodeId: string | undefined): PageNode {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new Error(`Missing node: ${nodeId ?? ""}`);
  }
  return node;
}

export function requireAppSurface(flow: ProductFlow, appId: string | undefined): AppSurface {
  const surface = flow.appSurfaces?.find((item) => item.appId === appId);
  if (!surface) {
    throw new Error(`Missing app surface: ${appId ?? ""}`);
  }
  return surface;
}

export function requireEdge(flow: ProductFlow, edgeId: string | undefined): FlowEdge {
  const edge = flow.edges.find((item) => item.edgeId === edgeId);
  if (!edge) {
    throw new Error(`Missing edge: ${edgeId ?? ""}`);
  }
  return edge;
}

export function uniqueNodeId(flow: ProductFlow, baseId: string): string {
  if (!flow.nodes.some((node) => node.nodeId === baseId)) {
    return baseId;
  }
  return `${baseId}_${shortHash(`${baseId}:${nowIso()}:${flow.nodes.length}`, 4)}`;
}

export function uniqueEdgeId(flow: ProductFlow, fromNodeId: string, toNodeId: string, trigger: string): string {
  const baseId = makeEdgeId(fromNodeId, toNodeId, `${trigger}:${nowIso()}:${flow.edges.length}`);
  if (!flow.edges.some((edge) => edge.edgeId === baseId)) {
    return baseId;
  }
  return `edge_${shortHash(`${baseId}:${nowIso()}`, 12)}`;
}

export function markFlowEdgeRemoved(edge: FlowEdge): void {
  edge.status = "removed";
  edge.removedAt = nowIso();
}

export function requireEdgeType(value: unknown): EdgeType {
  if (!isEdgeType(value)) {
    throw new Error(`Unsupported edge type: ${String(value)}`);
  }
  return value;
}

export function touchFlow(flow: ProductFlow): void {
  flow.revision += 1;
  flow.updatedAt = nowIso();
}

export function sanitizeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function mergeUnique(...arrays: string[][]): string[] {
  return Array.from(new Set(arrays.flat().filter(Boolean)));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
