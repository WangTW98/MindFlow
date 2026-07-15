import type { FlowEdge, FlowEndpoint, ProductFlow } from "../..";
import { PROJECT_OVERVIEW_NODE_ID } from "../projectOverviewMutations";
import { deriveFeatureGroups } from "./featureGroups";
import { requireAppSurface, requireNode } from "./shared";

export function normalizeEndpoint(endpoint: FlowEndpoint): FlowEndpoint {
  if (endpoint.kind === "appSurface") {
    if (!endpoint.appId) {
      throw new Error("App surface endpoint requires appId.");
    }
    const appId = endpoint.appId;
    return {
      kind: "appSurface",
      nodeId: appId,
      appId
    };
  }
  if (endpoint.kind === "featureItem") {
    return { kind: endpoint.kind, nodeId: endpoint.nodeId, groupId: endpoint.groupId, itemId: endpoint.itemId };
  }
  if (endpoint.kind === "featureGroup") {
    return { kind: endpoint.kind, nodeId: endpoint.nodeId, groupId: endpoint.groupId };
  }
  if (endpoint.kind === "projectOverview") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  return { kind: "node", nodeId: endpoint.nodeId };
}

export function validateEndpoint(flow: ProductFlow, endpoint: FlowEndpoint): void {
  if (endpoint.kind === "projectOverview") {
    if (endpoint.nodeId !== PROJECT_OVERVIEW_NODE_ID) {
      throw new Error("Project overview endpoint requires projectOverview nodeId.");
    }
    return;
  }
  if (endpoint.kind === "appSurface") {
    if (!endpoint.appId) {
      throw new Error("App surface endpoint requires appId.");
    }
    requireAppSurface(flow, endpoint.appId);
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
    const appId = endpoint.appId!;
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
    return endpoint.appId!;
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
    return [endpoint.appId!];
  }
  return requireNode(flow, endpoint.nodeId).appSurfaceIds ?? [];
}

export function endpointDomainIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "projectOverview") {
    return [];
  }
  if (endpoint.kind === "appSurface") {
    return requireAppSurface(flow, endpoint.appId!).domainIds;
  }
  return requireNode(flow, endpoint.nodeId).domainIds;
}

export function endpointRoleIds(flow: ProductFlow, endpoint: FlowEndpoint): string[] {
  if (endpoint.kind === "projectOverview") {
    return [];
  }
  if (endpoint.kind === "appSurface") {
    return requireAppSurface(flow, endpoint.appId!).roleIds;
  }
  return requireNode(flow, endpoint.nodeId).roleIds;
}

export function edgeReferencesNode(edge: FlowEdge, nodeId: string): boolean {
  return (edge.from.kind !== "appSurface" && edge.from.kind !== "projectOverview" && edge.from.nodeId === nodeId) ||
    (edge.to.kind !== "appSurface" && edge.to.kind !== "projectOverview" && edge.to.nodeId === nodeId);
}
