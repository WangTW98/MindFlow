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
  return Boolean(target?.closest?.(".floating-taxonomy-controls, .floating-taxonomy-panels, .selection-relations-panel"));
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
