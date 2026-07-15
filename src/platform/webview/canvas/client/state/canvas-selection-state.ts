let selectedNodeIds = readIdSelection(state.selectedNodeIds);
let selectedNodeId = selectedNodeIds.includes(state.selectedNodeId)
    ? state.selectedNodeId
    : selectedNodeIds[0] || state.selectedNodeId || "";
if (selectedNodeIds.length === 0 && selectedNodeId) {
  selectedNodeIds = [selectedNodeId];
} else if (selectedNodeId && !selectedNodeIds.includes(selectedNodeId)) {
  selectedNodeId = selectedNodeIds[0] || "";
}
let selectedProjectOverview = Boolean(state.selectedProjectOverview);
let selectedEdgeId = state.selectedEdgeId || "";
let selectedAppSurfaceId = state.selectedAppSurfaceId || "";
let selectedDomainId = state.selectedDomainId || "";
let selectedRoleId = state.selectedRoleId || "";
let selectedStatusGroupId = state.selectedStatusGroupId || "";

function applyHostSelection(selection) {
  selectedNodeIds = uniqueStringIds(selection?.selectedNodeIds);
  selectedNodeId = typeof selection?.selectedNodeId === "string" && selectedNodeIds.includes(selection.selectedNodeId)
    ? selection.selectedNodeId
    : selectedNodeIds[0] || "";
  selectedProjectOverview = selection?.selectedProjectOverview === true;
  selectedEdgeId = typeof selection?.selectedEdgeId === "string" ? selection.selectedEdgeId : "";
  selectedAppSurfaceId = typeof selection?.selectedAppSurfaceId === "string" ? selection.selectedAppSurfaceId : "";
  selectedDomainId = typeof selection?.selectedDomainId === "string" ? selection.selectedDomainId : "";
  selectedRoleId = typeof selection?.selectedRoleId === "string" ? selection.selectedRoleId : "";
  selectedStatusGroupId = typeof selection?.selectedStatusGroupId === "string" ? selection.selectedStatusGroupId : "";
}
