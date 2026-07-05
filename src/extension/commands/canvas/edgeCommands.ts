import * as vscode from "vscode";
import type { EdgeType, FlowEndpoint } from "../../../models/productFlow";
import { createManualEdge, removeManualEdge, updateManualEdgeDetails, type UpdateEdgeDetailsInput } from "../../../core/flowEditing";
import { isPlainObject } from "../guards";
import type { FlowUriArgument } from "../../flowContext";
import { applyCanvasEdit, selectAndRevealFlow } from "./editSession";

export async function createEdge(
  context: vscode.ExtensionContext,
  from?: FlowEndpoint,
  to?: FlowEndpoint,
  trigger?: string,
  type?: EdgeType,
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  if (!from || !to) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Create edge failed",
    edit: (flow) => createManualEdge(flow, { from, to, trigger, type }),
    afterSave: (flow, flowUri, edge) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedEdgeId: edge.edgeId });
    }
  });
}

export async function updateEdgeDetails(
  context: vscode.ExtensionContext,
  edgeId?: string,
  patch?: UpdateEdgeDetailsInput,
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  if (!edgeId || !isPlainObject<UpdateEdgeDetailsInput>(patch)) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Update edge details failed",
    edit: (flow) => updateManualEdgeDetails(flow, edgeId, patch),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedEdgeId: edgeId });
    }
  });
}

export async function disconnectEdge(context: vscode.ExtensionContext, edgeId?: string, sourceUri?: FlowUriArgument): Promise<boolean> {
  if (!edgeId) {
    return false;
  }
  return applyCanvasEdit({
    sourceUri,
    errorLabel: "Disconnect edge failed",
    edit: (flow) => removeManualEdge(flow, edgeId),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false });
    }
  });
}
