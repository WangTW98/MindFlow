import * as vscode from "vscode";
import { applyTaxonomyRequest, type TaxonomyRequest } from "../../core/taxonomy";
import { FlowPanel } from "../../webview/FlowPanel";
import { applyFlowDocumentEdit, loadCurrentFlow, showError, type FlowUriArgument } from "../flowContext";
import { isPlainObject } from "./guards";

export async function updateTaxonomy(context: vscode.ExtensionContext, request?: TaxonomyRequest, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!isPlainObject<TaxonomyRequest>(request)) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    applyTaxonomyRequest(flow, request);
    await applyFlowDocumentEdit(flowUri, flow);
    if (request.action === "delete") {
      const selection = FlowPanel.getSelection(flowUri);
      if (request.kind === "appSurface") {
        selection.selectedAppSurfaceId = undefined;
      } else if (request.kind === "domain") {
        selection.selectedDomainId = undefined;
      } else if (request.kind === "role") {
        selection.selectedRoleId = undefined;
      } else if (request.kind === "statusGroup") {
        selection.selectedStatusGroupId = undefined;
      }
      FlowPanel.setSelection(flowUri, selection);
    }
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Update MindFlow metadata failed", error);
    return false;
  }
}
