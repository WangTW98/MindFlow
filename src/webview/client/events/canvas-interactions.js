function handleContextMenu(event) {
  const canvas = document.getElementById("canvas");
  if (!canvas || !canvas.contains(event.target)) {
    return;
  }
  if (event.target.closest(".project-overview-card") || event.target.closest(".node-card") || event.target.closest(".app-surface-card") || event.target.closest("[data-edge-id]")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const point = screenToWorld(event.clientX, event.clientY);
  postWebviewMessage({
    type: "createNodeAt",
    x: Math.round(point.x),
    y: Math.round(point.y),
      appSurfaceIds: appFilters,
      domainIds: domainFilters,
      roleIds: roleFilters
  });
}

function handleCanvasClick(event) {
  if (suppressNextCanvasClick) {
    suppressNextCanvasClick = false;
    return;
  }
  if (
    event.target.closest(".node-card") ||
    event.target.closest(".project-overview-card") ||
    event.target.closest(".app-surface-card") ||
    event.target.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") ||
    event.target.closest("[data-edge-id]") ||
    event.target.closest("button, input, textarea, select") ||
    connectionDrag
  ) {
    return;
  }
  closeAllTaxonomyPanels();
  clearSelection();
}

function clearSelection() {
  selectedProjectOverview = false;
  clearNodeSelectionState();
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  taxonomySelection = clearAllTaxonomySelections();
  connectingFrom = null;
  postWebviewMessage({ type: "clearSelection" });
  render();
}

function handleKeyDown(event) {
  if (event.key !== "Delete" && event.key !== "Backspace") {
    return;
  }
  if (isEditingTarget(event.target)) {
    return;
  }
  if (selectedNodeIds.length > 1) {
    event.preventDefault();
    return;
  }
  if (selectedNodeIds.length === 1) {
    const nodeId = selectedNodeIds[0];
    const node = state.flow.nodes.find((item) => item.nodeId === nodeId);
    if (node && node.status !== "removed") {
      event.preventDefault();
      clearTimeout(nodeDetailsSaveTimer);
      nodeDetailsSaveTimer = null;
      clearNodeSelectionState();
      selectedEdgeId = "";
      postWebviewMessage({ type: "deleteNode", nodeId, nodeTitle: node.title });
    }
    return;
  }
  if (selectedEdgeId) {
    event.preventDefault();
    clearTimeout(edgeDetailsSaveTimer);
    edgeDetailsSaveTimer = null;
    const edgeId = selectedEdgeId;
    selectedEdgeId = "";
    postWebviewMessage({ type: "removeEdge", edgeId });
    return;
  }
  if (selectedProjectOverview) {
    event.preventDefault();
    return;
  }
  if (selectedAppSurfaceId) {
    event.preventDefault();
    deleteSelectedTaxonomy("appSurface", selectedAppSurfaceId);
    return;
  }
  if (selectedDomainId) {
    event.preventDefault();
    deleteSelectedTaxonomy("domain", selectedDomainId);
    return;
  }
  if (selectedRoleId) {
    event.preventDefault();
    deleteSelectedTaxonomy("role", selectedRoleId);
    return;
  }
  if (selectedStatusGroupId) {
    event.preventDefault();
    deleteSelectedTaxonomy("statusGroup", selectedStatusGroupId);
  }
}

function deleteSelectedTaxonomy(kind, id) {
  if (!kind || !id) {
    return;
  }
  cancelPendingTaxonomyDetailsSave(kind);
  selectedProjectOverview = false;
  clearTaxonomySelection(kind, id);
  clearNodeSelectionState();
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  connectingFrom = null;
  postWebviewMessage({ type: "updateTaxonomy", request: { kind, action: "delete", id } });
  render();
}
