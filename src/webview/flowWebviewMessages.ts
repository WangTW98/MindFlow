import type { TaxonomyRequest } from "../core/taxonomy";
import type { EdgeType, FlowEndpoint } from "../models/productFlow";
import { isEdgeType, isFlowEndpointKind } from "../models/productFlow";

export type WebviewMessage =
  | { type: "selectNode"; nodeId: string }
  | { type: "selectEdge"; edgeId: string }
  | { type: "selectAppSurface"; appId: string }
  | { type: "selectDomain"; domainId: string }
  | { type: "selectRole"; roleId: string }
  | { type: "selectStatusGroup"; statusGroupId: string }
  | { type: "selectProjectOverview" }
  | { type: "clearSelection" }
  | { type: "deleteNode"; nodeId: string; nodeTitle?: string }
  | { type: "saveNodePosition"; nodeId: string; x: number; y: number }
  | { type: "saveAppSurfacePosition"; appId: string; x: number; y: number }
  | { type: "saveProjectOverviewPosition"; x: number; y: number }
  | { type: "createNodeAt"; x: number; y: number; appSurfaceIds?: string[]; domainIds?: string[]; roleIds?: string[] }
  | { type: "updateNodeDetails"; nodeId: string; patch: Record<string, unknown> }
  | { type: "updateProjectOverview"; patch: Record<string, unknown> }
  | { type: "createEdge"; from: FlowEndpoint; to: FlowEndpoint; trigger?: string; edgeType?: EdgeType }
  | { type: "createConnectedNodeAt"; request: Record<string, unknown> }
  | { type: "updateEdgeDetails"; edgeId: string; revision?: number; patch: Record<string, unknown> }
  | { type: "removeEdge"; edgeId: string }
  | { type: "updateTaxonomy"; request: TaxonomyRequest };

export function parseWebviewMessage(message: unknown): WebviewMessage | undefined {
  if (!isRecord(message) || typeof message.type !== "string") {
    return undefined;
  }

  switch (message.type) {
    case "selectNode": {
      const nodeId = readString(message, "nodeId");
      return nodeId ? { type: "selectNode", nodeId } : undefined;
    }
    case "selectEdge": {
      const edgeId = readString(message, "edgeId");
      return edgeId ? { type: "selectEdge", edgeId } : undefined;
    }
    case "selectAppSurface": {
      const appId = readString(message, "appId");
      return appId ? { type: "selectAppSurface", appId } : undefined;
    }
    case "selectDomain": {
      const domainId = readString(message, "domainId");
      return domainId ? { type: "selectDomain", domainId } : undefined;
    }
    case "selectRole": {
      const roleId = readString(message, "roleId");
      return roleId ? { type: "selectRole", roleId } : undefined;
    }
    case "selectStatusGroup": {
      const statusGroupId = readString(message, "statusGroupId");
      return statusGroupId ? { type: "selectStatusGroup", statusGroupId } : undefined;
    }
    case "selectProjectOverview":
    case "clearSelection":
      return { type: message.type };
    case "deleteNode": {
      const nodeId = readString(message, "nodeId");
      return nodeId ? { type: "deleteNode", nodeId, nodeTitle: readOptionalString(message, "nodeTitle") } : undefined;
    }
    case "saveNodePosition": {
      const nodeId = readString(message, "nodeId");
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return nodeId && x !== undefined && y !== undefined ? { type: "saveNodePosition", nodeId, x, y } : undefined;
    }
    case "saveAppSurfacePosition": {
      const appId = readString(message, "appId");
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return appId && x !== undefined && y !== undefined ? { type: "saveAppSurfacePosition", appId, x, y } : undefined;
    }
    case "saveProjectOverviewPosition": {
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return x !== undefined && y !== undefined ? { type: "saveProjectOverviewPosition", x, y } : undefined;
    }
    case "createNodeAt": {
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return x !== undefined && y !== undefined
        ? {
            type: "createNodeAt",
            x,
            y,
            appSurfaceIds: readOptionalStringArray(message, "appSurfaceIds"),
            domainIds: readOptionalStringArray(message, "domainIds"),
            roleIds: readOptionalStringArray(message, "roleIds")
          }
        : undefined;
    }
    case "updateNodeDetails": {
      const nodeId = readString(message, "nodeId");
      const patch = readRecord(message, "patch");
      return nodeId && patch ? { type: "updateNodeDetails", nodeId, patch } : undefined;
    }
    case "updateProjectOverview": {
      const patch = readRecord(message, "patch");
      return patch ? { type: "updateProjectOverview", patch } : undefined;
    }
    case "createEdge": {
      const from = readEndpoint(message.from);
      const to = readEndpoint(message.to);
      const edgeType = readOptionalEdgeType(message, "edgeType");
      return from && to && edgeType !== false
        ? { type: "createEdge", from, to, trigger: readOptionalString(message, "trigger"), edgeType: edgeType ?? undefined }
        : undefined;
    }
    case "createConnectedNodeAt": {
      const request = readConnectedNodeRequest(message.request);
      return request ? { type: "createConnectedNodeAt", request } : undefined;
    }
    case "updateEdgeDetails": {
      const edgeId = readString(message, "edgeId");
      const patch = readEdgeDetailsPatch(message.patch);
      const revision = readOptionalNumber(message, "revision");
      return edgeId && patch && revision !== false ? { type: "updateEdgeDetails", edgeId, revision: revision ?? undefined, patch } : undefined;
    }
    case "removeEdge": {
      const edgeId = readString(message, "edgeId");
      return edgeId ? { type: "removeEdge", edgeId } : undefined;
    }
    case "updateTaxonomy": {
      const request = readTaxonomyRequest(message.request);
      return request ? { type: "updateTaxonomy", request } : undefined;
    }
    default:
      return undefined;
  }
}

function readConnectedNodeRequest(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = value.from === undefined ? undefined : readEndpoint(value.from);
  const to = value.to === undefined ? undefined : readEndpoint(value.to);
  if (!from && !to) {
    return undefined;
  }
  const type = value.type === undefined ? undefined : readEdgeType(value.type);
  if (value.type !== undefined && !type) {
    return undefined;
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(typeof value.x === "number" && Number.isFinite(value.x) ? { x: value.x } : {}),
    ...(typeof value.y === "number" && Number.isFinite(value.y) ? { y: value.y } : {}),
    ...(typeof value.trigger === "string" ? { trigger: value.trigger } : {}),
    ...(type ? { type } : {}),
    ...(readOptionalStringArray(value, "appSurfaceIds") ? { appSurfaceIds: readOptionalStringArray(value, "appSurfaceIds") } : {}),
    ...(readOptionalStringArray(value, "domainIds") ? { domainIds: readOptionalStringArray(value, "domainIds") } : {}),
    ...(readOptionalStringArray(value, "roleIds") ? { roleIds: readOptionalStringArray(value, "roleIds") } : {})
  };
}

function readEdgeDetailsPatch(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = value.from === undefined ? undefined : readEndpoint(value.from);
  const to = value.to === undefined ? undefined : readEndpoint(value.to);
  const edgeType = value.type === undefined ? undefined : readEdgeType(value.type);
  if ((value.from !== undefined && !from) || (value.to !== undefined && !to) || (value.type !== undefined && !edgeType)) {
    return undefined;
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(typeof value.trigger === "string" ? { trigger: value.trigger } : {}),
    ...(typeof value.action === "string" ? { action: value.action } : {}),
    ...(edgeType ? { type: edgeType } : {}),
    ...(typeof value.condition === "string" ? { condition: value.condition } : {}),
    ...(readOptionalStringArray(value, "appSurfaceIds") ? { appSurfaceIds: readOptionalStringArray(value, "appSurfaceIds") } : {}),
    ...(readOptionalStringArray(value, "domainIds") ? { domainIds: readOptionalStringArray(value, "domainIds") } : {}),
    ...(readOptionalStringArray(value, "roleIds") ? { roleIds: readOptionalStringArray(value, "roleIds") } : {})
  };
}

function readEndpoint(value: unknown): FlowEndpoint | undefined {
  if (!isRecord(value) || !isFlowEndpointKind(value.kind)) {
    return undefined;
  }
  const nodeId = readString(value, "nodeId");
  if (!nodeId) {
    return undefined;
  }
  if (value.kind === "appSurface") {
    const appId = readOptionalString(value, "appId") ?? nodeId;
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
  return {
    kind: value.kind,
    nodeId,
    ...(groupId ? { groupId } : {}),
    ...(itemId ? { itemId } : {})
  };
}

function readTaxonomyRequest(value: unknown): TaxonomyRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = value.kind;
  const action = value.action;
  if (kind !== "appSurface" && kind !== "domain" && kind !== "role" && kind !== "statusGroup") {
    return undefined;
  }
  if (action !== "create" && action !== "update" && action !== "delete") {
    return undefined;
  }
  const id = readOptionalString(value, "id");
  const item = readRecord(value, "item");
  if (action === "delete" && !id) {
    return undefined;
  }
  return { kind, action, ...(id ? { id } : {}), ...(item ? { item } : {}) };
}

function readOptionalEdgeType(obj: Record<string, unknown>, key: string): EdgeType | false | undefined {
  if (obj[key] === undefined) {
    return undefined;
  }
  return readEdgeType(obj[key]) ?? false;
}

function readEdgeType(value: unknown): EdgeType | undefined {
  return isEdgeType(value) ? value : undefined;
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" && obj[key].trim() ? obj[key] : undefined;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" ? obj[key] : undefined;
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  return typeof obj[key] === "number" && Number.isFinite(obj[key]) ? obj[key] : undefined;
}

function readOptionalNumber(obj: Record<string, unknown>, key: string): number | false | undefined {
  if (obj[key] === undefined) {
    return undefined;
  }
  return typeof obj[key] === "number" && Number.isFinite(obj[key]) ? obj[key] : false;
}

function readOptionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function readRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = obj[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
