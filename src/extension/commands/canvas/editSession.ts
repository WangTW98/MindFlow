import * as vscode from "vscode";
import type { ProductFlow } from "../../../models/productFlow";
import { FlowPanel } from "../../../webview/FlowPanel";
import { editCurrentFlowDocument, showError, type FlowUriArgument } from "../../flowContext";
import type { FlowSelectionPatch } from "../../../core/editorSelection";
import { applyFlowOperation, type FlowOperation, type FlowOperationResult } from "../../../core/flowOperations";

export interface CanvasEditOptions<TResult> {
  sourceUri?: FlowUriArgument;
  errorLabel: string;
  operation(flow: ProductFlow, flowUri: vscode.Uri): FlowOperation;
  afterSave?(flow: ProductFlow, flowUri: vscode.Uri, result: FlowOperationResult): void;
}

export async function applyCanvasEdit<TResult>(options: CanvasEditOptions<TResult>): Promise<boolean> {
  try {
    const { flow, flowUri, result } = await editCurrentFlowDocument(options.sourceUri, (flow, flowUri) => {
      const operation = options.operation(flow, flowUri);
      return applyFlowOperation(flow, operation);
    });
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
