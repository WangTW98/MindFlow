export interface FlowSelectionState {
  selectedProjectOverview: boolean;
  selectedNodeId?: string;
  selectedNodeIds: string[];
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
    selectedNodeIds: [],
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

export function normalizeFlowSelection(selection: FlowSelectionPatch): FlowSelectionState {
  const nodeIds = normalizeIds(selection.selectedNodeIds);
  const selectedNodeId = typeof selection.selectedNodeId === "string" && selection.selectedNodeId.trim()
    ? selection.selectedNodeId.trim()
    : undefined;
  const selectedNodeIds = nodeIds.length > 0
    ? nodeIds
    : selectedNodeId
      ? [selectedNodeId]
      : [];
  const primaryNodeId = selectedNodeId && selectedNodeIds.includes(selectedNodeId)
    ? selectedNodeId
    : selectedNodeIds[0];
  return {
    selectedProjectOverview: Boolean(selection.selectedProjectOverview),
    selectedNodeId: primaryNodeId,
    selectedNodeIds,
    selectedEdgeId: normalizeOptionalId(selection.selectedEdgeId),
    selectedAppSurfaceId: normalizeOptionalId(selection.selectedAppSurfaceId),
    selectedDomainId: normalizeOptionalId(selection.selectedDomainId),
    selectedRoleId: normalizeOptionalId(selection.selectedRoleId),
    selectedStatusGroupId: normalizeOptionalId(selection.selectedStatusGroupId)
  };
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
}

function normalizeOptionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
