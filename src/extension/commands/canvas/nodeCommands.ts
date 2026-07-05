import * as vscode from "vscode";
import { createManualEdge, createManualNode, removeManualNode, updateManualAppSurfacePosition, updateManualNodeDetails, updateManualNodePosition, type UpdateNodeDetailsInput } from "../../../core/flowEditing";
import { hasOptionalFiniteCoordinates, isPlainObject, readFiniteCoordinates } from "../guards";
import type { FlowUriArgument } from "../../flowContext";
import { applyCanvasEdit, selectAndRevealFlow } from "./editSession";
import type { CreateConnectedNodeRequest } from "./types";

export async function updateNodePosition(nodeId?: string, x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  const coordinates = readFiniteCoordinates(x, y);
  if (!nodeId || !coordinates) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Update node position failed",
    edit: (flow) => updateManualNodePosition(flow, nodeId, coordinates.x, coordinates.y)
  });
}

export async function updateAppSurfacePosition(appId?: string, x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  const coordinates = readFiniteCoordinates(x, y);
  if (!appId || !coordinates) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Update app surface position failed",
    edit: (flow) => updateManualAppSurfacePosition(flow, appId, coordinates.x, coordinates.y)
  });
}

export async function createNodeAt(
  context: vscode.ExtensionContext,
  x?: number,
  y?: number,
  appSurfaceIds?: string[],
  domainIds?: string[],
  roleIds?: string[],
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  if (!hasOptionalFiniteCoordinates(x, y)) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Create node failed",
    edit: (flow) => createManualNode(flow, {
      x,
      y,
      appSurfaceIds: Array.isArray(appSurfaceIds) ? appSurfaceIds : undefined,
      domainIds: Array.isArray(domainIds) ? domainIds : undefined,
      roleIds: Array.isArray(roleIds) ? roleIds : undefined
    }),
    afterSave: (flow, flowUri, node) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedNodeId: node.nodeId });
    }
  });
}

export async function updateNodeDetails(
  context: vscode.ExtensionContext,
  nodeId?: string,
  patch?: UpdateNodeDetailsInput,
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  if (!nodeId || !isPlainObject<UpdateNodeDetailsInput>(patch)) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Update node details failed",
    edit: (flow) => updateManualNodeDetails(flow, nodeId, patch),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedNodeId: nodeId });
    }
  });
}

export async function createConnectedNodeAt(
  context: vscode.ExtensionContext,
  request?: CreateConnectedNodeRequest,
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  if (!isPlainObject<CreateConnectedNodeRequest>(request) || (!request.from && !request.to) || !hasOptionalFiniteCoordinates(request.x, request.y)) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Create connected node failed",
    edit: (flow) => {
      const relatedNode = request.from
        ? request.from.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.from?.nodeId)
        : request.to?.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.to?.nodeId);
      const relatedAppSurfaceIds = request.from?.kind === "appSurface"
        ? [request.from.appId ?? request.from.nodeId]
        : request.to?.kind === "appSurface"
          ? [request.to.appId ?? request.to.nodeId]
          : relatedNode?.appSurfaceIds;
      const node = createManualNode(flow, {
        x: request.x,
        y: request.y,
        appSurfaceIds: nonEmptyArrayOr(request.appSurfaceIds, relatedAppSurfaceIds),
        domainIds: nonEmptyArrayOr(request.domainIds, relatedNode?.domainIds),
        roleIds: nonEmptyArrayOr(request.roleIds, relatedNode?.roleIds)
      });
      if (request.from) {
        createManualEdge(flow, {
          from: request.from,
          to: { kind: "node", nodeId: node.nodeId },
          trigger: request.trigger,
          type: request.type
        });
      } else if (request.to) {
        createManualEdge(flow, {
          from: { kind: "node", nodeId: node.nodeId },
          to: request.to,
          trigger: request.trigger,
          type: request.type
        });
      }
      return node;
    },
    afterSave: (flow, flowUri, node) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedNodeId: node.nodeId });
    }
  });
}

export async function deleteNode(context: vscode.ExtensionContext, nodeId?: string, sourceUri?: FlowUriArgument): Promise<boolean> {
  if (!nodeId) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Delete node failed",
    edit: (flow) => removeManualNode(flow, nodeId),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false });
    }
  });
}

function nonEmptyArrayOr(value: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}
