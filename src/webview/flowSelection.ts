export interface FlowSelectionState {
  selectedProjectOverview: boolean;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  selectedAppSurfaceId?: string;
  selectedDomainId?: string;
  selectedRoleId?: string;
  selectedStatusGroupId?: string;
}

export type FlowSelectionPatch = Partial<FlowSelectionState>;

export function emptyFlowSelection(): FlowSelectionState {
  return {
    selectedProjectOverview: false,
    selectedNodeId: undefined,
    selectedEdgeId: undefined,
    selectedAppSurfaceId: undefined,
    selectedDomainId: undefined,
    selectedRoleId: undefined,
    selectedStatusGroupId: undefined
  };
}

export function flowSelectionKey(flowUri: { toString(): string } | string): string {
  return typeof flowUri === "string" ? flowUri : flowUri.toString();
}
