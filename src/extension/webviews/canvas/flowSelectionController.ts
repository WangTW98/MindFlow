import * as vscode from "vscode";
import type { FlowSelectionPatch, FlowSelectionState } from "../../../domain/selection";

export interface FlowEditorSelectionController {
  getSelection(flowUri: vscode.Uri | string): FlowSelectionState;
  setSelection(flowUri: vscode.Uri | string, selection: FlowSelectionPatch): void;
}
