import * as vscode from "vscode";
import type { TaxonomyRequest } from "../../state/operations";
import { applyFlowOperation, type FlowOperation, type FlowOperationResult } from "../../state/operations";
import { editCurrentFlowDocument, showError, type FlowUriArgument } from "../../vscode/flowContext";
import { FlowPanel } from "../../vscode/webviews/canvas/FlowPanel";
import { isPlainObject } from "./guards";

export async function updateTaxonomy(context: vscode.ExtensionContext, request?: TaxonomyRequest, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!isPlainObject<TaxonomyRequest>(request)) {
      return false;
    }
    const { flow, flowUri, result } = await editCurrentFlowDocument(sourceUri, (flow) =>
      applyFlowOperation(flow, taxonomyOperationFromRequest(request))
    );
    const selection = operationSelection(result);
    if (request.action === "delete" && selection) {
      FlowPanel.updateSelection(flowUri, selection);
    }
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Update MindFlow metadata failed", error);
    return false;
  }
}

function taxonomyOperationFromRequest(request: TaxonomyRequest): FlowOperation {
  if (request.action === "delete") {
    if (!request.id) {
      throw new Error(`Deleting ${request.kind} requires id.`);
    }
    return { type: "taxonomy.remove", kind: request.kind, id: request.id };
  }
  return { type: "taxonomy.upsert", kind: request.kind, id: request.id, item: request.item };
}

function operationSelection(result: FlowOperationResult) {
  return "selection" in result ? result.selection : undefined;
}
