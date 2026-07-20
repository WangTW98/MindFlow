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

export interface MindFlowCanvasPosition { x: number; y: number }
export interface MindFlowAutoLayoutPreview {
  projectOverviewPosition: MindFlowCanvasPosition;
  appSurfacePositions: Record<string, MindFlowCanvasPosition>;
  nodePositions: Record<string, MindFlowCanvasPosition>;
}
export interface MindFlowRevealTarget {
  kind: "projectOverview" | "appSurface" | "node";
  id: string;
}

export interface MindFlowEditorBridge {
  createFlow?(title?: string): Promise<MindFlowEditorSnapshot>;
  openFlow?(flowPath: string): Promise<MindFlowEditorSnapshot>;
  getOpenEditors(): Promise<MindFlowEditorSnapshot[]>;
  getActiveEditor(flowUri?: string): Promise<MindFlowEditorSnapshot>;
  setSelection(flowUri: string, selection: FlowSelectionPatch): Promise<MindFlowEditorSnapshot>;
  previewAutoLayout?(flowUri: string): Promise<MindFlowAutoLayoutPreview>;
  revealEntities?(flowUri: string, targets: MindFlowRevealTarget[], animate?: boolean): Promise<void>;
  applyFlowEdit(flowUri: string, flow: ProductFlow, selection?: FlowSelectionPatch, expectedRevision?: number): Promise<MindFlowEditorSnapshot>;
}
