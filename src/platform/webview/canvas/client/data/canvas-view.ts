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
      centerCard("node", nodeId, { fitToViewport: true, animate: true });
    }
  });
}

function allNodeSelectionForFlow(flow, currentPrimaryNodeId) {
  const nodeIds = flow.nodes
    .filter((node) => node.status !== "removed")
    .map((node) => node.nodeId);
  if (nodeIds.length === 0) {
    return null;
  }
  return {
    nodeIds,
    primaryNodeId: nodeIds.includes(currentPrimaryNodeId) ? currentPrimaryNodeId : nodeIds[0]
  };
}

function activeSelectedNodeIds(flow, nodeIds) {
  const activeNodeIds = new Set(
    flow.nodes
      .filter((node) => node.status !== "removed")
      .map((node) => node.nodeId)
  );
  return uniqueStringIds(nodeIds).filter((nodeId) => activeNodeIds.has(nodeId));
}

function selectAllNodes() {
  const selection = allNodeSelectionForFlow(state.flow, selectedNodeId);
  if (!selection) {
    return false;
  }
  selectedProjectOverview = false;
  setSelectedNodes(selection.nodeIds, selection.primaryNodeId);
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  taxonomySelection = clearAllTaxonomySelections();
  connectingFrom = null;
  postWebviewMessage({ type: "selectNode", nodeId: selectedNodeId, selectedNodeIds });
  render();
  focusCanvas();
  return true;
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

function centerCard(kind, id, options: { fitToViewport?: boolean; animate?: boolean } = {}) {
  const canvas = document.getElementById("canvas");
  const card = getCardElement(kind, id);
  const pos = getCardPosition(kind, id);
  if (!canvas || !card || !pos) {
    return;
  }
  let nextViewport = null;
  if (options.fitToViewport === true) {
    nextViewport = canvasViewportFocusForCard({
      x: pos.x,
      y: pos.y,
      width: card.offsetWidth,
      height: card.offsetHeight
    }, {
      width: canvas.clientWidth,
      height: canvas.clientHeight
    });
  }
  nextViewport ||= {
    zoom,
    camera: {
      x: canvas.clientWidth / 2 - (pos.x + card.offsetWidth / 2) * zoom,
      y: canvas.clientHeight / 2 - (pos.y + card.offsetHeight / 2) * zoom
    }
  };
  if (options.animate === true) {
    animateCanvasViewport(nextViewport);
    return;
  }
  cancelCanvasViewportAnimation(false);
  applyCanvasViewport(nextViewport);
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
