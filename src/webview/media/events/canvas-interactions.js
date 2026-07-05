function seedProjectOverviewPosition(flow) {
  if (projectOverviewPosition) {
    return;
  }
  const saved = flow.projectOverview && flow.projectOverview.view && flow.projectOverview.view.position;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    projectOverviewPosition = { x: saved.x, y: saved.y };
    return;
  }
  projectOverviewPosition = {
    x: PROJECT_OVERVIEW_DEFAULT_X,
    y: PROJECT_OVERVIEW_DEFAULT_Y
  };
}

function seedNodePositions(flow) {
  flow.nodes.forEach((node, index) => {
    if (nodePositions.has(node.nodeId)) {
      return;
    }
    const saved = node.view && node.view.position;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      nodePositions.set(node.nodeId, { x: saved.x, y: saved.y });
      return;
    }
    nodePositions.set(node.nodeId, {
      x: (index % 4) * 380,
      y: Math.floor(index / 4) * 340
    });
  });
}

function seedAppSurfacePositions(flow) {
  (flow.appSurfaces || []).forEach((surface, index) => {
    if (appSurfacePositions.has(surface.appId)) {
      return;
    }
    const saved = surface.view && surface.view.position;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      appSurfacePositions.set(surface.appId, { x: saved.x, y: saved.y });
      return;
    }
    appSurfacePositions.set(surface.appId, appSurfaceSourcePosition(index));
  });
}

function positionCards() {
  const projectOverviewCard = document.querySelector(".project-overview-card");
  if (projectOverviewCard && projectOverviewPosition) {
    projectOverviewCard.style.left = `${projectOverviewPosition.x}px`;
    projectOverviewCard.style.top = `${projectOverviewPosition.y}px`;
  }
  document.querySelectorAll(".node-card").forEach((card) => {
    const nodeId = card.dataset.nodeId;
    const pos = nodePositions.get(nodeId);
    if (!pos) {
      return;
    }
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
  });
  document.querySelectorAll(".app-surface-card").forEach((card) => {
    const appId = card.dataset.appSurfaceId;
    const pos = appSurfacePositions.get(appId);
    if (!pos) {
      return;
    }
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
  });
}

function applyCamera() {
  const world = document.getElementById("world");
  const canvas = document.getElementById("canvas");
  const pill = document.querySelector(".zoom-pill");
  if (world) {
    world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${zoom})`;
  }
  if (canvas) {
    const grid = Math.max(8, 32 * zoom);
    canvas.style.backgroundSize = `${grid}px ${grid}px`;
    canvas.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
  }
  if (pill) {
    pill.textContent = `${Math.round(zoom * 100)}%`;
  }
  persistUiState();
}

function shouldLetPanelHandleWheel(target) {
  return Boolean(target?.closest?.(".floating-taxonomy-controls, .floating-taxonomy-panels"));
}

function handleWheel(event) {
  if (shouldLetPanelHandleWheel(event.target)) {
    return;
  }
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    zoomAt(event.clientX, event.clientY, zoom * factor);
    return;
  }
  camera.x -= event.deltaX;
  camera.y -= event.deltaY;
  applyCamera();
  scheduleDrawEdges();
}

function zoomAt(clientX, clientY, nextZoom) {
  const canvas = document.getElementById("canvas");
  const rect = canvas.getBoundingClientRect();
  const before = screenToWorld(clientX, clientY);
  zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  camera.x = clientX - rect.left - before.x * zoom;
  camera.y = clientY - rect.top - before.y * zoom;
  applyCamera();
  scheduleDrawEdges();
}

function startConnectionDrag(event, direction, endpoint, button) {
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const start = elementCenterInCanvas(button);
  const current = pointerCanvasPoint(event);
  connectionDrag = {
    pointerId: event.pointerId,
    direction,
    endpoint,
    button,
    start,
    current,
    startClientX: event.clientX,
    startClientY: event.clientY,
    moved: false
  };
  button.setPointerCapture(event.pointerId);
  button.addEventListener("pointermove", moveConnectionDrag);
  button.addEventListener("pointerup", endConnectionDrag);
  button.addEventListener("pointercancel", cancelConnectionDrag);
  scheduleDrawEdges();
}

function moveConnectionDrag(event) {
  if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
    return;
  }
  event.preventDefault();
  const dx = event.clientX - connectionDrag.startClientX;
  const dy = event.clientY - connectionDrag.startClientY;
  if (Math.hypot(dx, dy) > 4) {
    connectionDrag.moved = true;
  }
  connectionDrag.current = pointerCanvasPoint(event);
  updateConnectionDropTarget(event);
  scheduleDrawEdges();
}

function endConnectionDrag(event) {
  if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const drag = connectionDrag;
  releaseConnectionCapture(event);
  connectionDrag = null;
  clearConnectionDropTarget();

  if (!drag.moved) {
    finishConnectionClick(drag);
    scheduleDrawEdges();
    return;
  }

  const releaseElement = document.elementFromPoint(event.clientX, event.clientY);
  if (drag.direction === "from") {
    const targetDot = releaseElement?.closest(".target-dot");
    const to = targetDot ? endpointFromTargetButton(targetDot) : null;
    if (to) {
      postCreateEdge(drag.endpoint, to);
    } else if (isBlankCanvasPoint(releaseElement)) {
      postCreateConnectedNode({ from: drag.endpoint }, event);
    }
  } else {
    const originDot = releaseElement?.closest(".origin-dot");
    if (originDot) {
      postCreateEdge(endpointFromButton(originDot), drag.endpoint);
    } else if (isBlankCanvasPoint(releaseElement)) {
      postCreateConnectedNode({ to: drag.endpoint }, event);
    }
  }
  scheduleDrawEdges();
}

function cancelConnectionDrag(event) {
  if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
    return;
  }
  releaseConnectionCapture(event);
  connectionDrag = null;
  clearConnectionDropTarget();
  scheduleDrawEdges();
}

function releaseConnectionCapture(event) {
  const button = connectionDrag?.button;
  if (!button) {
    return;
  }
  button.removeEventListener("pointermove", moveConnectionDrag);
  button.removeEventListener("pointerup", endConnectionDrag);
  button.removeEventListener("pointercancel", cancelConnectionDrag);
  try {
    button.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can be released by the webview before pointerup.
  }
}

function updateConnectionDropTarget(event) {
  if (!connectionDrag) {
    clearConnectionDropTarget();
    return;
  }
  setConnectionDropTarget(getConnectionDropTarget(event.clientX, event.clientY));
}

function getConnectionDropTarget(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element) {
    return null;
  }
  if (connectionDrag.direction === "from") {
    return element.closest(".target-dot");
  }
  return element.closest(".origin-dot");
}

function setConnectionDropTarget(target) {
  if (connectionDropTarget === target) {
    return;
  }
  clearConnectionDropTarget();
  connectionDropTarget = target;
  if (connectionDropTarget) {
    connectionDropTarget.classList.add("drop-candidate");
  }
}

function clearConnectionDropTarget() {
  if (!connectionDropTarget) {
    return;
  }
  connectionDropTarget.classList.remove("drop-candidate");
  connectionDropTarget = null;
}

function finishConnectionClick(drag) {
  if (drag.direction === "from") {
    connectingFrom = drag.endpoint;
    persistUiState();
    render();
    return;
  }
  if (connectingFrom && drag.endpoint) {
    postCreateEdge(connectingFrom, drag.endpoint);
    persistUiState();
    return;
  }
  if (drag.endpoint.kind === "appSurface") {
    selectAppSurface(endpointEntityId(drag.endpoint));
    return;
  }
  if (drag.endpoint.nodeId) {
    selectNode(drag.endpoint.nodeId, false);
  }
}

function postCreateEdge(from, to) {
  if (!from || !to) {
    return;
  }
  vscode.postMessage({ type: "createEdge", from, to, trigger: "手动连接", edgeType: "interaction" });
}

function postCreateConnectedNode(link, event) {
  const point = screenToWorld(event.clientX, event.clientY);
  vscode.postMessage({
    type: "createConnectedNodeAt",
    request: {
      ...link,
      x: Math.round(point.x),
      y: Math.round(point.y),
      trigger: "手动连接",
      type: "interaction",
      appSurfaceIds: appFilters,
      domainIds: domainFilters,
      roleIds: roleFilters
    }
  });
}

function elementCenterInCanvas(element) {
  const rect = element.getBoundingClientRect();
  const canvasRect = document.getElementById("canvas").getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - canvasRect.left,
    y: rect.top + rect.height / 2 - canvasRect.top
  };
}

function pointerCanvasPoint(event) {
  const canvasRect = document.getElementById("canvas").getBoundingClientRect();
  return {
    x: event.clientX - canvasRect.left,
    y: event.clientY - canvasRect.top
  };
}

function isBlankCanvasPoint(element) {
  const canvas = document.getElementById("canvas");
  return Boolean(
    element &&
    canvas?.contains(element) &&
    !element.closest(".project-overview-card") &&
    !element.closest(".node-card") &&
    !element.closest(".app-surface-card") &&
    !element.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") &&
    !element.closest("[data-edge-id]") &&
    !element.closest("button, input, textarea, select")
  );
}

function startPan(event) {
  if (
    connectionDrag ||
    (event.button !== 0 && event.button !== 1) ||
    event.target.closest(".project-overview-card") ||
    event.target.closest(".node-card") ||
    event.target.closest(".app-surface-card") ||
    event.target.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") ||
    event.target.closest("button, input, textarea, select") ||
    event.target.closest("[data-edge-id]")
  ) {
    return;
  }
  const canvas = document.getElementById("canvas");
  panState = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    cameraX: camera.x,
    cameraY: camera.y,
    moved: false
  };
  canvas.classList.add("panning");
  canvas.setPointerCapture(event.pointerId);
}

function movePan(event) {
  if (!panState || event.pointerId !== panState.pointerId) {
    return;
  }
  camera.x = panState.cameraX + event.clientX - panState.x;
  camera.y = panState.cameraY + event.clientY - panState.y;
  if (Math.abs(event.clientX - panState.x) > 2 || Math.abs(event.clientY - panState.y) > 2) {
    panState.moved = true;
  }
  applyCamera();
  scheduleDrawEdges();
}

function endPan(event) {
  if (!panState || event.pointerId !== panState.pointerId) {
    return;
  }
  const canvas = document.getElementById("canvas");
  suppressNextCanvasClick = Boolean(panState.moved);
  panState = null;
  canvas.classList.remove("panning");
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can be released by the webview before pointerup.
  }
}

function startNodeDrag(event) {
  startCardDrag(event, "node");
}

function startProjectOverviewDrag(event) {
  startCardDrag(event, "projectOverview");
}

function startAppSurfaceDrag(event) {
  startCardDrag(event, "appSurface");
}

function getCardPosition(kind, id) {
  if (kind === "projectOverview") {
    return projectOverviewPosition;
  }
  return kind === "appSurface" ? appSurfacePositions.get(id) : nodePositions.get(id);
}

function setCardPosition(kind, id, position) {
  if (kind === "projectOverview") {
    projectOverviewPosition = position;
    return;
  }
  const positions = kind === "appSurface" ? appSurfacePositions : nodePositions;
  positions.set(id, position);
}

function startCardDrag(event, kind) {
  if (event.button !== 0 || event.target.closest("button, input, textarea, select")) {
    return;
  }
  event.stopPropagation();
  const card = event.currentTarget;
  const id = kind === "appSurface"
    ? card.dataset.appSurfaceId
    : kind === "projectOverview"
      ? PROJECT_OVERVIEW_NODE_ID
      : card.dataset.nodeId;
  const pos = getCardPosition(kind, id);
  if (!id || !pos) {
    return;
  }
  selectedEdgeId = "";
  selectedDomainId = "";
  selectedRoleId = "";
  selectedStatusGroupId = "";
  if (kind === "appSurface") {
    selectedProjectOverview = false;
    clearNodeSelectionState();
    taxonomySelection = {
      appSurface: id,
      domain: "",
      role: "",
      statusGroup: ""
    };
  } else if (kind === "projectOverview") {
    selectedProjectOverview = true;
    clearNodeSelectionState();
    selectedAppSurfaceId = "";
    taxonomySelection = clearAllTaxonomySelections();
  } else {
    selectedProjectOverview = false;
    selectedAppSurfaceId = "";
    taxonomySelection = clearAllTaxonomySelections();
  }
  dragState = {
    pointerId: event.pointerId,
    kind,
    id,
    card,
    startX: event.clientX,
    startY: event.clientY,
    originX: pos.x,
    originY: pos.y,
    moved: false,
    multiSelect: kind === "node" && isNodeMultiSelectEvent(event)
  };
  card.classList.add("dragging");
  card.setPointerCapture(event.pointerId);
  card.addEventListener("pointermove", moveCardDrag);
  card.addEventListener("pointerup", endCardDrag);
  card.addEventListener("pointercancel", endCardDrag);
}

function moveCardDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }
  const screenDx = event.clientX - dragState.startX;
  const screenDy = event.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(screenDx, screenDy) <= CARD_DRAG_THRESHOLD_PX) {
    return;
  }
  const dx = screenDx / zoom;
  const dy = screenDy / zoom;
  if (!dragState.moved) {
    dragState.moved = true;
  }
  const next = {
    x: Math.round(dragState.originX + dx),
    y: Math.round(dragState.originY + dy)
  };
  setCardPosition(dragState.kind, dragState.id, next);
  dragState.card.style.left = `${next.x}px`;
  dragState.card.style.top = `${next.y}px`;
  scheduleDrawEdges();
}

function endCardDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }
  const { kind, id, card, moved, multiSelect } = dragState;
  const pos = getCardPosition(kind, id);
  card.classList.remove("dragging");
  card.removeEventListener("pointermove", moveCardDrag);
  card.removeEventListener("pointerup", endCardDrag);
  card.removeEventListener("pointercancel", endCardDrag);
  try {
    card.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can be released by the webview before pointerup.
  }
  dragState = null;
  if (moved && pos) {
    selectedEdgeId = "";
    if (kind === "appSurface") {
      selectedProjectOverview = false;
      selectedAppSurfaceId = id;
      clearNodeSelectionState();
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = {
        appSurface: id,
        domain: "",
        role: "",
        statusGroup: ""
      };
      persistUiState();
      vscode.postMessage({ type: "saveAppSurfacePosition", appId: id, x: pos.x, y: pos.y });
      vscode.postMessage({ type: "selectAppSurface", appId: id });
    } else if (kind === "projectOverview") {
      selectedProjectOverview = true;
      clearNodeSelectionState();
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = clearAllTaxonomySelections();
      persistUiState();
      vscode.postMessage({ type: "saveProjectOverviewPosition", x: pos.x, y: pos.y });
      vscode.postMessage({ type: "selectProjectOverview" });
    } else {
      const multi = Boolean(multiSelect || isNodeMultiSelectEvent(event));
      if (multi) {
        event.preventDefault();
      }
      suppressNextNodeCardGeneratedClick();
      vscode.postMessage({ type: "saveNodePosition", nodeId: id, x: pos.x, y: pos.y });
      selectNode(id, false, { multi });
    }
    return;
  }
  if (kind === "appSurface") {
    selectAppSurface(id);
    return;
  }
  if (kind === "projectOverview") {
    selectProjectOverview();
    return;
  }
  const multi = Boolean(multiSelect || isNodeMultiSelectEvent(event));
  if (multi) {
    event.preventDefault();
  }
  suppressNextNodeCardGeneratedClick();
  selectNode(id, false, { multi });
}

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
  vscode.postMessage({
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
  vscode.postMessage({ type: "clearSelection" });
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
      vscode.postMessage({ type: "deleteNode", nodeId, nodeTitle: node.title });
    }
    return;
  }
  if (selectedEdgeId) {
    event.preventDefault();
    clearTimeout(edgeDetailsSaveTimer);
    edgeDetailsSaveTimer = null;
    const edgeId = selectedEdgeId;
    selectedEdgeId = "";
    vscode.postMessage({ type: "removeEdge", edgeId });
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
  vscode.postMessage({ type: "updateTaxonomy", request: { kind, action: "delete", id } });
  render();
}
