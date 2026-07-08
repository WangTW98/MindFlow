// @ts-nocheck
function refreshCanvasAndNodeList() {
  const flow = state.flow;
  seedProjectOverviewPosition(flow);
  seedNodePositions(flow);
  seedAppSurfacePositions(flow);
  autoLayoutApplyPreviewState(flow);
  normalizeFilters();
  const activeNodes = flow.nodes.filter((node) => node.status !== "removed");
  const visibleListNodes = activeNodes.filter((node) => matchesNodeSearch(flow, node, nodeSearch));
  const world = document.getElementById("world");
  const nodeList = document.querySelector(".node-list");
  if (world) {
    world.innerHTML = `${renderProjectOverviewCard(flow)}${renderAppSurfaceSourceCards(flow)}${activeNodes.map((node) => renderNodeCard(flow, node)).join("")}`;
    applyStatusGroupColorSwatches(world);
  }
  if (nodeList) {
    nodeList.innerHTML = visibleListNodes.map((node) => renderNodeListItem(flow, node)).join("") || "<p class=\"empty\">无匹配节点</p>";
  }
  if (world || nodeList) {
    bindCanvasElements(world || document);
    if (nodeList) {
      bindCanvasElements(nodeList);
    }
    positionCards();
    refreshSelectionRelationsPanel();
    scheduleDrawEdges();
  }
}

function selectNode(nodeId, center, options = {}) {
  selectedProjectOverview = false;
  if (options.multi) {
    toggleNodeSelection(nodeId);
  } else {
    setSelectedNodes([nodeId], nodeId);
  }
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  taxonomySelection = clearAllTaxonomySelections();
  if (selectedNodeId) {
    postWebviewMessage({ type: "selectNode", nodeId: selectedNodeId, selectedNodeIds });
  } else {
    postWebviewMessage({ type: "clearSelection" });
  }
  render();
  requestAnimationFrame(() => {
    focusCanvas();
    if (center && selectedNodeIds.includes(nodeId)) {
      centerCard("node", nodeId);
    }
  });
}

function setSelectedNodes(nodeIds, primaryNodeId) {
  selectedNodeIds = uniqueStringIds(nodeIds);
  selectedNodeId = selectedNodeIds.includes(primaryNodeId)
    ? primaryNodeId
    : selectedNodeIds[0] || "";
}

function toggleNodeSelection(nodeId) {
  const current = new Set(selectedNodeIds);
  if (current.has(nodeId)) {
    current.delete(nodeId);
    const nextIds = selectedNodeIds.filter((id) => id !== nodeId);
    setSelectedNodes(nextIds, nextIds.includes(selectedNodeId) ? selectedNodeId : nextIds[nextIds.length - 1]);
    return;
  }
  setSelectedNodes([...selectedNodeIds, nodeId], nodeId);
}

function clearNodeSelectionState() {
  selectedNodeIds = [];
  selectedNodeId = "";
}

function isNodeSelected(nodeId) {
  return selectedNodeIds.includes(nodeId);
}

function isNodeMultiSelectEvent(event) {
  return Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
}

function suppressNextNodeCardGeneratedClick() {
  suppressNextNodeCardClick = true;
  suppressNextCanvasClick = true;
  setTimeout(() => {
    suppressNextNodeCardClick = false;
    suppressNextCanvasClick = false;
  }, CARD_CLICK_SUPPRESS_MS);
}

function selectEdge(edgeId) {
  selectedProjectOverview = false;
  selectedEdgeId = edgeId;
  clearNodeSelectionState();
  selectedAppSurfaceId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  taxonomySelection = clearAllTaxonomySelections();
  postWebviewMessage({ type: "selectEdge", edgeId });
  render();
  requestAnimationFrame(() => focusCanvas());
}

function selectAppSurface(appId) {
  selectedProjectOverview = false;
  selectedAppSurfaceId = appId;
  clearNodeSelectionState();
  selectedEdgeId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  taxonomySelection = {
    appSurface: appId,
    domain: "",
    role: "",
    statusGroup: ""
  };
  persistUiState();
  postWebviewMessage({ type: "selectAppSurface", appId });
  render();
  requestAnimationFrame(() => focusCanvas());
}

function selectStatusGroup(statusGroupId) {
  selectedProjectOverview = false;
  selectedStatusGroupId = statusGroupId;
  clearNodeSelectionState();
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  taxonomySelection = {
    appSurface: "",
    domain: "",
    role: "",
    statusGroup: statusGroupId
  };
  persistUiState();
  postWebviewMessage({ type: "selectStatusGroup", statusGroupId });
  render();
  requestAnimationFrame(() => focusCanvas());
}

function selectProjectOverview() {
  selectedProjectOverview = true;
  clearNodeSelectionState();
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  taxonomySelection = clearAllTaxonomySelections();
  persistUiState();
  postWebviewMessage({ type: "selectProjectOverview" });
  render();
  requestAnimationFrame(() => focusCanvas());
}

function focusCanvas() {
  document.getElementById("canvas")?.focus({ preventScroll: true });
}

function centerCard(kind, id) {
  const canvas = document.getElementById("canvas");
  const card = getCardElement(kind, id);
  const pos = getCardPosition(kind, id);
  if (!canvas || !card || !pos) {
    return;
  }
  camera.x = canvas.clientWidth / 2 - (pos.x + card.offsetWidth / 2) * zoom;
  camera.y = canvas.clientHeight / 2 - (pos.y + card.offsetHeight / 2) * zoom;
  applyCamera();
  scheduleDrawEdges();
}

function centerNode(nodeId) {
  centerCard("node", nodeId);
}

function getCardElement(kind, id) {
  if (kind === "projectOverview") {
    return document.querySelector(".project-overview-card");
  }
  if (kind === "appSurface") {
    return document.querySelector(`.app-surface-card[data-app-surface-id="${cssEscape(id)}"]`);
  }
  return document.querySelector(`.node-card[data-node-id="${cssEscape(id)}"]`);
}
