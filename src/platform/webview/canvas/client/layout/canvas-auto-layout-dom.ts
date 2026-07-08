// @ts-nocheck
function autoLayoutApplyCanvasPreview() {
  const layout = autoLayoutComputePreview(state.flow, autoLayoutCollectMeasurements());
  autoLayoutPreviewState = null;
  autoLayoutApplyLayoutPositions(layout);
  persistUiState();
  positionCards();
  autoLayoutFitCanvasPreview(layout.bounds);
  scheduleDrawEdges();
  postWebviewMessage({
    type: "saveAutoLayoutPositions",
    projectOverviewPosition: layout.projectOverviewPosition,
    appSurfacePositions: layout.appSurfacePositions,
    nodePositions: layout.nodePositions
  });
}

function autoLayoutApplyLayoutPositions(layout) {
  projectOverviewPosition = autoLayoutCopyPosition(layout.projectOverviewPosition);
  appSurfacePositions.clear();
  for (const [appId, position] of Object.entries(layout.appSurfacePositions || {})) {
    const normalized = autoLayoutCopyPosition(position);
    if (normalized) {
      appSurfacePositions.set(appId, normalized);
    }
  }
  nodePositions.clear();
  for (const [nodeId, position] of Object.entries(layout.nodePositions || {})) {
    const normalized = autoLayoutCopyPosition(position);
    if (normalized) {
      nodePositions.set(nodeId, normalized);
    }
  }
}

function autoLayoutCollectMeasurements() {
  const measurements = {
    projectOverview: autoLayoutMeasureElement(document.querySelector(".project-overview-card"), AUTO_LAYOUT_ROOT_WIDTH, AUTO_LAYOUT_ROOT_HEIGHT),
    appSurfaces: {},
    nodes: {}
  };
  document.querySelectorAll(".app-surface-card[data-app-surface-id]").forEach((card) => {
    measurements.appSurfaces[card.dataset.appSurfaceId] = autoLayoutMeasureElement(card, AUTO_LAYOUT_APP_WIDTH, AUTO_LAYOUT_APP_HEIGHT);
  });
  document.querySelectorAll(".node-card[data-node-id]").forEach((card) => {
    measurements.nodes[card.dataset.nodeId] = autoLayoutMeasureElement(card, AUTO_LAYOUT_NODE_WIDTH, AUTO_LAYOUT_NODE_HEIGHT);
  });
  return measurements;
}

function autoLayoutMeasureElement(element, fallbackWidth, fallbackHeight) {
  if (!element) {
    return { width: fallbackWidth, height: fallbackHeight };
  }
  const rect = element.getBoundingClientRect?.();
  return {
    width: Math.max(fallbackWidth, Math.ceil(Number(element.offsetWidth) || Number(rect?.width) || fallbackWidth)),
    height: Math.max(fallbackHeight, Math.ceil(Number(element.offsetHeight) || Number(rect?.height) || fallbackHeight))
  };
}

function autoLayoutFitCanvasPreview(bounds) {
  const canvas = document.getElementById("canvas");
  if (!canvas || !bounds) {
    return;
  }
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const fitWidth = Math.max(1, canvas.clientWidth - AUTO_LAYOUT_FIT_PADDING * 2);
  const fitHeight = Math.max(1, canvas.clientHeight - AUTO_LAYOUT_FIT_PADDING * 2);
  zoom = clamp(Math.min(1, fitWidth / width, fitHeight / height), MIN_ZOOM, MAX_ZOOM);
  camera = {
    x: Math.round((canvas.clientWidth - width * zoom) / 2 - bounds.minX * zoom),
    y: Math.round((canvas.clientHeight - height * zoom) / 2 - bounds.minY * zoom)
  };
  applyCamera();
}

function autoLayoutApplyPreviewState(flow) {
  const positions = autoLayoutPreviewPositionsForFlow(flow, autoLayoutPreviewState);
  if (!positions) {
    if (autoLayoutPreviewState) {
      autoLayoutPreviewState = null;
    }
    return false;
  }
  autoLayoutPreviewState = positions;
  projectOverviewPosition = positions.projectOverviewPosition;
  appSurfacePositions.clear();
  for (const [appId, position] of Object.entries(positions.appSurfacePositions)) {
    appSurfacePositions.set(appId, position);
  }
  nodePositions.clear();
  for (const [nodeId, position] of Object.entries(positions.nodePositions)) {
    nodePositions.set(nodeId, position);
  }
  return true;
}

function autoLayoutUpdatePreviewPosition(kind, id, position) {
  if (!autoLayoutPreviewState || !position) {
    return;
  }
  const nextState = autoLayoutPreviewStateWithPosition(autoLayoutPreviewState, kind, id, position);
  if (!nextState || !autoLayoutPreviewStateMatchesFlow(nextState, state.flow)) {
    autoLayoutPreviewState = null;
    persistUiState();
    return;
  }
  autoLayoutPreviewState = nextState;
  persistUiState();
}
