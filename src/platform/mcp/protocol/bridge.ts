import type { ProductFlow } from "../../../product-flow/domain";
import type { FlowSelectionPatch, FlowSelectionState } from "../../../product-flow/domain/selection";

export interface MindFlowEditorSnapshot {
  uri: string;
  path: string;
  displayName: string;
  active: boolean;
  dirty: boolean;
  flow: ProductFlow;
  selection: FlowSelectionState;
}

export interface MindFlowEditorBridge {
  createFlow?(title?: string): Promise<MindFlowEditorSnapshot>;
  openFlow?(flowPath: string): Promise<MindFlowEditorSnapshot>;
  getOpenEditors(): Promise<MindFlowEditorSnapshot[]>;
  getActiveEditor(flowUri?: string): Promise<MindFlowEditorSnapshot>;
  setSelection(flowUri: string, selection: FlowSelectionPatch): Promise<MindFlowEditorSnapshot>;
  applyFlowEdit(flowUri: string, flow: ProductFlow, selection?: FlowSelectionPatch, expectedRevision?: number): Promise<MindFlowEditorSnapshot>;
}
