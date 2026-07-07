import * as vscode from "vscode";
import type { UpdateNodeDetailsInput } from "../../../domain/operations";
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
    operation: () => ({ type: "node.move", nodeId, x: coordinates.x, y: coordinates.y })
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
    operation: () => ({ type: "appSurface.move", appId, x: coordinates.x, y: coordinates.y })
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
    operation: () => ({
      type: "node.create",
      input: {
        x,
        y,
        appSurfaceIds: Array.isArray(appSurfaceIds) ? appSurfaceIds : undefined,
        domainIds: Array.isArray(domainIds) ? domainIds : undefined,
        roleIds: Array.isArray(roleIds) ? roleIds : undefined
      }
    }),
    afterSave: (flow, flowUri, result) => {
      if (result.type === "node.create") {
        selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedNodeId: result.node.nodeId });
      }
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
    operation: () => ({ type: "node.update", nodeId, patch }),
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
    operation: () => ({ type: "node.createConnected", request }),
    afterSave: (flow, flowUri, result) => {
      if (result.type === "node.createConnected") {
        selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedNodeId: result.node.nodeId });
      }
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
    operation: () => ({ type: "node.remove", nodeId }),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false });
    }
  });
}
