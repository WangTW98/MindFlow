import type { ProductFlow } from "../models/productFlow";
import type { FlowSelectionPatch, FlowSelectionState } from "../webview/flowSelection";

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
  getOpenEditors(): Promise<MindFlowEditorSnapshot[]>;
  getActiveEditor(flowUri?: string): Promise<MindFlowEditorSnapshot>;
  applyFlowEdit(flowUri: string, flow: ProductFlow, selection?: FlowSelectionPatch): Promise<MindFlowEditorSnapshot>;
}
