function handleContextMenu(event) {
  const canvas = document.getElementById("canvas");
  if (!canvas || !canvas.contains(event.target)) {
    return;
  }
  if (event.target.closest(".project-overview-card") || event.target.closest(".node-card") || event.target.closest(".app-surface-card") || event.target.closest(".selection-relations-panel") || event.target.closest("[data-edge-id]")) {
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
    event.target.closest(".selection-relations-panel") ||
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
  if (handleSelectAllNodesShortcut(event)) {
    return;
  }
  if (handleNodeClipboardShortcut(event)) {
    return;
  }
  if (event.key !== "Delete" && event.key !== "Backspace") {
    return;
  }
  if (isEditingTarget(event.target)) {
    return;
  }
  if (deleteSelectedNodes()) {
    event.preventDefault();
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

function deleteSelectedNodes() {
  const nodeIds = activeSelectedNodeIds(state.flow, selectedNodeIds);
  if (nodeIds.length === 0) {
    return false;
  }
  clearTimeout(nodeDetailsSaveTimer);
  nodeDetailsSaveTimer = null;
  clearNodeSelectionState();
  selectedEdgeId = "";
  if (nodeIds.length === 1) {
    postWebviewMessage({ type: "deleteNode", nodeId: nodeIds[0] });
    return true;
  }
  postWebviewMessage({
    type: "flow.operations",
    operations: nodeIds.map((nodeId) => ({ type: "node.remove", nodeId }))
  });
  return true;
}

function handleSelectAllNodesShortcut(event) {
  if (
    isEditingTarget(event.target) ||
    !isCanvasCommandModifier(event) ||
    String(event.key || "").toLowerCase() !== "a"
  ) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  clearNativeDocumentSelection();
  selectAllNodes();
  return true;
}

function clearNativeDocumentSelection() {
  const selection = window.getSelection?.();
  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
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
