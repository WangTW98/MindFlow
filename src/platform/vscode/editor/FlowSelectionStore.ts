import * as vscode from "vscode";
import {
  emptyFlowSelection,
  normalizeFlowSelection,
  type FlowSelectionPatch,
  type FlowSelectionState
} from "../../../product-flow/domain/selection";
import { canonicalFileKey } from "../../../shared/canonicalFileKey";

export class FlowSelectionStore {
  private readonly selections = new Map<string, FlowSelectionState>();

  public get(flowUri: vscode.Uri | string): FlowSelectionState {
    return normalizeFlowSelection({
      ...emptyFlowSelection(),
      ...(this.selections.get(canonicalFileKey(flowUri)) ?? {})
    });
  }

  public set(flowUri: vscode.Uri | string, selection: FlowSelectionPatch): void {
    this.selections.set(canonicalFileKey(flowUri), normalizeFlowSelection({
      ...emptyFlowSelection(),
      ...selection
    }));
  }

  public update(flowUri: vscode.Uri | string, patch: FlowSelectionPatch): void {
    this.set(flowUri, {
      ...this.get(flowUri),
      ...patch
    });
  }

  public delete(flowUri: vscode.Uri | string): void {
    this.selections.delete(canonicalFileKey(flowUri));
  }
}
