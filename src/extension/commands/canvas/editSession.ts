import * as vscode from "vscode";
import type { ProductFlow } from "../../../models/productFlow";
import { FlowPanel } from "../../../webview/FlowPanel";
import { applyFlowDocumentEdit, loadCurrentFlow, showError, type FlowUriArgument } from "../../flowContext";
import type { FlowSelectionPatch } from "../../../webview/flowSelection";

export interface CanvasEditOptions<TResult> {
  sourceUri?: FlowUriArgument;
  errorLabel: string;
  edit(flow: ProductFlow, flowUri: vscode.Uri): TResult;
  afterSave?(flow: ProductFlow, flowUri: vscode.Uri, result: TResult): void;
}

export async function applyCanvasEdit<TResult>(options: CanvasEditOptions<TResult>): Promise<boolean> {
  try {
    const { flow, flowUri } = await loadCurrentFlow(options.sourceUri);
    const result = options.edit(flow, flowUri);
    await applyFlowDocumentEdit(flowUri, flow);
    options.afterSave?.(flow, flowUri, result);
    return true;
  } catch (error) {
    showError(options.errorLabel, error);
    return false;
  }
}

export function selectAndRevealFlow(
  context: vscode.ExtensionContext,
  flow: ProductFlow,
  flowUri: vscode.Uri,
  selection: FlowSelectionPatch
): void {
  FlowPanel.setSelection(flowUri, selection);
  FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
}
