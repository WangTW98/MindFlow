import { isEdgeType, isFlowEndpointKind, type EdgeType, type FlowEndpoint } from "../../../../product-flow/domain";
import { isRecord, readOptionalString, readString } from "./readers";

export function readEndpoint(value: unknown): FlowEndpoint | undefined {
  if (!isRecord(value) || !isFlowEndpointKind(value.kind)) {
    return undefined;
  }
  const nodeId = readString(value, "nodeId");
  if (!nodeId) {
    return undefined;
  }
  if (value.kind === "appSurface") {
    const appId = readOptionalString(value, "appId");
    if (!appId || appId !== nodeId) {
      return undefined;
    }
    return { kind: "appSurface", nodeId: appId, appId };
  }
  if (value.kind === "projectOverview") {
    return nodeId === "projectOverview" ? { kind: "projectOverview", nodeId } : undefined;
  }
  const groupId = readOptionalString(value, "groupId");
  const itemId = readOptionalString(value, "itemId");
  if (value.kind === "featureGroup" && !groupId) {
    return undefined;
  }
  if (value.kind === "featureItem" && (!groupId || !itemId)) {
    return undefined;
  }
  if (value.kind === "featureItem") {
    return { kind: value.kind, nodeId, groupId: groupId!, itemId: itemId! };
  }
  if (value.kind === "featureGroup") {
    return { kind: value.kind, nodeId, groupId: groupId! };
  }
  return { kind: "node", nodeId };
}

export function readOptionalEdgeType(obj: Record<string, unknown>, key: string): EdgeType | false | undefined {
  if (obj[key] === undefined) {
    return undefined;
  }
  return readEdgeType(obj[key]) ?? false;
}

export function readEdgeType(value: unknown): EdgeType | undefined {
  return isEdgeType(value) ? value : undefined;
}
