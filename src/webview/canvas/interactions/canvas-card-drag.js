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
    autoLayoutUpdatePreviewPosition(kind, id, pos);
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
      postWebviewMessage({ type: "saveAppSurfacePosition", appId: id, x: pos.x, y: pos.y });
      postWebviewMessage({ type: "selectAppSurface", appId: id });
    } else if (kind === "projectOverview") {
      selectedProjectOverview = true;
      clearNodeSelectionState();
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = clearAllTaxonomySelections();
      persistUiState();
      postWebviewMessage({ type: "saveProjectOverviewPosition", x: pos.x, y: pos.y });
      postWebviewMessage({ type: "selectProjectOverview" });
    } else {
      const multi = Boolean(multiSelect || isNodeMultiSelectEvent(event));
      if (multi) {
        event.preventDefault();
      }
      suppressNextNodeCardGeneratedClick();
      postWebviewMessage({ type: "saveNodePosition", nodeId: id, x: pos.x, y: pos.y });
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
