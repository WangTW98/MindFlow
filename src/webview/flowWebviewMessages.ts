import type { TaxonomyRequest } from "../core/taxonomy";
import type { EdgeType, FlowEndpoint } from "../models/productFlow";
import { readEndpoint, readOptionalEdgeType } from "./messages/endpointPayload";
import { readConnectedNodeRequest, readEdgeDetailsPatch, readTaxonomyRequest } from "./messages/messagePayloads";
import { isRecord, readNumber, readOptionalNumber, readOptionalString, readOptionalStringArray, readRecord, readString } from "./messages/readers";

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
    case "selectNode":
      return readIdMessage(message, "nodeId", "selectNode");
    case "selectEdge":
      return readIdMessage(message, "edgeId", "selectEdge");
    case "selectAppSurface":
      return readIdMessage(message, "appId", "selectAppSurface");
    case "selectDomain":
      return readIdMessage(message, "domainId", "selectDomain");
    case "selectRole":
      return readIdMessage(message, "roleId", "selectRole");
    case "selectStatusGroup":
      return readIdMessage(message, "statusGroupId", "selectStatusGroup");
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

function readIdMessage<TType extends WebviewMessage["type"], TKey extends string>(
  message: Record<string, unknown>,
  key: TKey,
  type: TType
): Extract<WebviewMessage, { type: TType }> | undefined {
  const id = readString(message, key);
  return id ? ({ type, [key]: id } as Extract<WebviewMessage, { type: TType }>) : undefined;
}
