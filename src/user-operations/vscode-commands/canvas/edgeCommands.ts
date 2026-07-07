import * as vscode from "vscode";
import type { EdgeType, FlowEndpoint } from "../../../state/product-flow";
import type { UpdateEdgeDetailsInput } from "../../../state/operations";
import { isPlainObject } from "../guards";
import type { FlowUriArgument } from "../../../vscode/flowContext";
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
    operation: () => ({ type: "edge.upsert", input: { from, to, trigger, type } }),
    afterSave: (flow, flowUri, result) => {
      if (result.type === "edge.upsert") {
        selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false, selectedEdgeId: result.edge.edgeId });
      }
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
    operation: () => ({ type: "edge.update", edgeId, patch }),
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
    operation: () => ({ type: "edge.remove", edgeId }),
    afterSave: (flow, flowUri) => {
      selectAndRevealFlow(context, flow, flowUri, { selectedProjectOverview: false });
    }
  });
}
