// @ts-nocheck
let selectedNodeIds = readIdSelection(persisted.selectedNodeIds || state.selectedNodeIds, state.selectedNodeId || persisted.selectedNodeId);
let selectedNodeId = selectedNodeIds.includes(persisted.selectedNodeId)
  ? persisted.selectedNodeId
  : selectedNodeIds.includes(state.selectedNodeId)
    ? state.selectedNodeId
    : selectedNodeIds[0] || state.selectedNodeId || persisted.selectedNodeId || "";
if (selectedNodeIds.length === 0 && selectedNodeId) {
  selectedNodeIds = [selectedNodeId];
} else if (selectedNodeId && !selectedNodeIds.includes(selectedNodeId)) {
  selectedNodeId = selectedNodeIds[0] || "";
}
let selectedProjectOverview = Boolean(state.selectedProjectOverview || persisted.selectedProjectOverview);
let selectedEdgeId = state.selectedEdgeId || "";
let selectedAppSurfaceId = state.selectedAppSurfaceId || persisted.selectedAppSurfaceId || "";
let selectedDomainId = state.selectedDomainId || persisted.selectedDomainId || "";
let selectedRoleId = state.selectedRoleId || persisted.selectedRoleId || "";
let selectedStatusGroupId = state.selectedStatusGroupId || persisted.selectedStatusGroupId || "";
