import { readEndpoint, readOptionalEdgeType } from "./messages/endpointPayload";
import { readConnectedNodeRequest, readEdgeDetailsPatch, readTaxonomyRequest } from "./messages/messagePayloads";
import type { FlowOperation, UpsertEdgeOperationInput } from "../../../product-flow/application/operations";
import type { WebviewMessage, WebviewPosition } from "./messages/protocol";
import { isRecord, readNumber, readOptionalNumber, readOptionalString, readOptionalStringArray, readRecord, readString } from "./messages/readers";

export type { WebviewMessage } from "./messages/protocol";

export function parseWebviewMessage(message: unknown): WebviewMessage | undefined {
  if (!isRecord(message) || typeof message.type !== "string") {
    return undefined;
  }

  switch (message.type) {
    case "flow.operation": {
      const operation = readFlowOperation(message.operation);
      return operation ? { type: "flow.operation", operation } : undefined;
    }
    case "flow.operations": {
      const operations = Array.isArray(message.operations)
        ? message.operations.map(readFlowOperation)
        : undefined;
      return operations && operations.every((operation) => operation !== undefined)
        ? { type: "flow.operations", operations: operations as NonNullable<(typeof operations)[number]>[] }
        : undefined;
    }
    case "selectNode":
      return readSelectNodeMessage(message);
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
    case "saveAutoLayoutPositions": {
      const projectOverviewPosition = readPositionPayload(message.projectOverviewPosition);
      const appSurfacePositions = readPositionRecordPayload(message.appSurfacePositions);
      const nodePositions = readPositionRecordPayload(message.nodePositions);
      return projectOverviewPosition && appSurfacePositions && nodePositions
        ? { type: "saveAutoLayoutPositions", projectOverviewPosition, appSurfacePositions, nodePositions }
        : undefined;
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

function readSelectNodeMessage(message: Record<string, unknown>): WebviewMessage | undefined {
  const nodeId = readString(message, "nodeId");
  if (!nodeId) {
    return undefined;
  }
  return {
    type: "selectNode",
    nodeId,
    selectedNodeIds: readOptionalStringArray(message, "selectedNodeIds")
  };
}

function readIdMessage<TType extends WebviewMessage["type"], TKey extends string>(
  message: Record<string, unknown>,
  key: TKey,
  type: TType
): Extract<WebviewMessage, { type: TType }> | undefined {
  const id = readString(message, key);
  return id ? ({ type, [key]: id } as Extract<WebviewMessage, { type: TType }>) : undefined;
}

function readPositionPayload(value: unknown): WebviewPosition | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const x = readNumber(value, "x");
  const y = readNumber(value, "y");
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function readPositionRecordPayload(value: unknown): Record<string, WebviewPosition> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const positions: Record<string, WebviewPosition> = {};
  for (const [id, position] of Object.entries(value)) {
    const normalized = readPositionPayload(position);
    if (!id || !normalized) {
      return undefined;
    }
    positions[id] = normalized;
  }
  return positions;
}

function readFlowOperation(value: unknown): FlowOperation | undefined {
  if (!isRecord(value) || typeof value.type !== "string") {
    return undefined;
  }
  switch (value.type) {
    case "project.update": {
      const patch = readRecord(value, "patch");
      return patch ? { type: "project.update", patch } : undefined;
    }
    case "project.move": {
      const x = readNumber(value, "x");
      const y = readNumber(value, "y");
      return x !== undefined && y !== undefined ? { type: "project.move", x, y } : undefined;
    }
    case "taxonomy.upsert":
    case "taxonomy.remove":
      return readTaxonomyOperation(value);
    case "appSurface.move": {
      const appId = readString(value, "appId");
      const x = readNumber(value, "x");
      const y = readNumber(value, "y");
      return appId && x !== undefined && y !== undefined ? { type: "appSurface.move", appId, x, y } : undefined;
    }
    case "node.create":
      return {
        type: "node.create",
        input: isRecord(value.input) ? value.input : undefined,
        detailPatch: isRecord(value.detailPatch) ? value.detailPatch : undefined
      };
    case "node.update": {
      const nodeId = readString(value, "nodeId");
      const patch = readRecord(value, "patch");
      return nodeId && patch ? { type: "node.update", nodeId, patch } : undefined;
    }
    case "node.move": {
      const nodeId = readString(value, "nodeId");
      const x = readNumber(value, "x");
      const y = readNumber(value, "y");
      return nodeId && x !== undefined && y !== undefined ? { type: "node.move", nodeId, x, y } : undefined;
    }
    case "node.remove": {
      const nodeId = readString(value, "nodeId");
      return nodeId ? { type: "node.remove", nodeId } : undefined;
    }
    case "node.createConnected": {
      const request = readConnectedNodeRequest(value.request);
      return request ? { type: "node.createConnected", request } : undefined;
    }
    case "edge.upsert": {
      const input = readEdgeUpsertInput(value.input);
      return input ? { type: "edge.upsert", input } : undefined;
    }
    case "edge.update": {
      const edgeId = readString(value, "edgeId");
      const patch = readEdgeDetailsPatch(value.patch);
      return edgeId && patch ? { type: "edge.update", edgeId, patch } : undefined;
    }
    case "edge.remove": {
      const edgeId = readString(value, "edgeId");
      return edgeId ? { type: "edge.remove", edgeId } : undefined;
    }
    default:
      return undefined;
  }
}

function readTaxonomyOperation(value: Record<string, unknown>): FlowOperation | undefined {
  const kind = value.kind;
  if (kind !== "appSurface" && kind !== "domain" && kind !== "role" && kind !== "statusGroup") {
    return undefined;
  }
  const id = readOptionalString(value, "id");
  if (value.type === "taxonomy.remove") {
    return id ? { type: "taxonomy.remove", kind, id } : undefined;
  }
  return { type: "taxonomy.upsert", kind, ...(id ? { id } : {}), item: isRecord(value.item) ? value.item : undefined };
}

function readEdgeUpsertInput(value: unknown): UpsertEdgeOperationInput | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = value.from === undefined ? undefined : readEndpoint(value.from);
  const to = value.to === undefined ? undefined : readEndpoint(value.to);
  const type = value.type === undefined ? undefined : readOptionalEdgeType(value, "type");
  if ((value.from !== undefined && !from) || (value.to !== undefined && !to) || type === false) {
    return undefined;
  }
  return {
    edgeId: readOptionalString(value, "edgeId"),
    id: readOptionalString(value, "id"),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    trigger: readOptionalString(value, "trigger"),
    action: readOptionalString(value, "action"),
    ...(type ? { type } : {}),
    condition: readOptionalString(value, "condition")
  };
}
