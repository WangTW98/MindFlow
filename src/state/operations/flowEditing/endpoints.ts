import type { FlowEdge, FlowEndpoint, ProductFlow } from "../../product-flow";
import { PROJECT_OVERVIEW_NODE_ID } from "../projectOverview";
import { deriveFeatureGroups } from "./featureGroups";
import { requireAppSurface, requireNode } from "./shared";

export function normalizeEndpoint(endpoint: FlowEndpoint): FlowEndpoint {
  if (endpoint.kind === "appSurface") {
    const appId = endpoint.appId ?? endpoint.nodeId;
    return {
      kind: "appSurface",
      nodeId: appId,
      appId
    };
  }
  return {
    kind: endpoint.kind,
    nodeId: endpoint.nodeId,
    groupId: endpoint.groupId,
    itemId: endpoint.itemId
  };
}

export function validateEndpoint(flow: ProductFlow, endpoint: FlowEndpoint): void {
  if (endpoint.kind === "projectOverview") {
    if (endpoint.nodeId !== PROJECT_OVERVIEW_NODE_ID) {
      throw new Error("Project overview endpoint requires projectOverview nodeId.");
    }
    return;
  }
  if (endpoint.kind === "appSurface") {
    requireAppSurface(flow, endpoint.appId ?? endpoint.nodeId);
    return;
  }
  const node = requireNode(flow, endpoint.nodeId);
  if (endpoint.kind === "node") {
    return;
  }
  if (!endpoint.groupId) {
    throw new Error("Feature endpoint requires groupId.");
  }
  const group = deriveFeatureGroups(node).find((item) => item.groupId === endpoint.groupId);
  if (!group) {
    throw new Error(`Missing feature group: ${endpoint.groupId}`);
  }
  if (endpoint.kind === "featureGroup") {
    return;
  }
  if (!endpoint.itemId) {
    throw new Error("Feature item endpoint requires itemId.");
  }
  if (!group.items.some((item) => item.itemId === endpoint.itemId)) {
    throw new Error(`Missing feature item: ${endpoint.itemId}`);
  }
}

function endpointLabel(flow: ProductFlow, endpoint: FlowEndpoint): string {
  if (endpoint.kind === "projectOverview") {
    return flow.title || "项目概述";
  }
  if (endpoint.kind === "appSurface") {
    const appId = endpoint.appId ?? endpoint.nodeId;
    return flow.appSurfaces?.find((surface) => surface.appId === appId)?.name ?? appId;
  }
  if (endpoint.kind === "node") {
    return endpoint.nodeId;
  }
  if (endpoint.kind === "featureGroup") {
    return `${endpoint.nodeId}/${endpoint.groupId ?? ""}`;
  }
  return `${endpoint.nodeId}/${endpoint.groupId ?? ""}/${endpoint.itemId ?? ""}`;
}

export function endpointStorageId(endpoint: FlowEndpoint): string {
  if (endpoint.kind === "appSurface") {
    return endpoint.appId ?? endpoint.nodeId;
  }
  if (endpoint.kind === "projectOverview") {
    return PROJECT_OVERVIEW_NODE_ID;
  }
  return endpoint.nodeId;
}

export function endpointAppSurfaceIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "projectOverview") {
    return [];
  }
  if (endpoint.kind === "appSurface") {
    return [endpoint.appId ?? endpoint.nodeId];
  }
  return requireNode(flow, endpoint.nodeId).appSurfaceIds ?? [];
}

export function endpointDomainIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "projectOverview") {
    return [];
  }
  if (endpoint.kind === "appSurface") {
    return requireAppSurface(flow, endpoint.appId ?? endpoint.nodeId).domainIds;
  }
  return requireNode(flow, endpoint.nodeId).domainIds;
}

export function endpointRoleIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "projectOverview") {
    return [];
  }
  if (endpoint.kind === "appSurface") {
    return requireAppSurface(flow, endpoint.appId ?? endpoint.nodeId).roleIds;
  }
  return requireNode(flow, endpoint.nodeId).roleIds;
}

export function edgeReferencesNode(edge: FlowEdge, nodeId: string): boolean {
  const from = edge.from ?? { kind: "node", nodeId: edge.fromNodeId };
  const to = edge.to ?? { kind: "node", nodeId: edge.toNodeId };
  return (from.kind !== "appSurface" && from.kind !== "projectOverview" && from.nodeId === nodeId) ||
    (to.kind !== "appSurface" && to.kind !== "projectOverview" && to.nodeId === nodeId);
}
