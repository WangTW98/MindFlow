const INITIAL_VIEWPORT_FIT_PADDING = 72;
const RELATION_CARD_FOCUS_PADDING = 64;
const CAMERA_ANIMATION_MIN_DURATION_MS = 280;
const CAMERA_ANIMATION_MAX_DURATION_MS = 600;
const CAMERA_ANIMATION_DISTANCE_FACTOR = 0.18;
const CAMERA_ANIMATION_ZOOM_DISTANCE = 600;
let canvasViewportAnimationFrame = null;

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

function initializeCanvasViewportForOpen(flow) {
  const key = canvasViewportInitializationKey(flow);
  if (!key || viewportInitializedFor === key) {
    return false;
  }
  if (fitCanvasViewportToContent()) {
    viewportInitializedFor = key;
    return true;
  }
  requestAnimationFrame(() => {
    if (viewportInitializedFor === key || !fitCanvasViewportToContent()) {
      return;
    }
    viewportInitializedFor = key;
    applyCamera();
    scheduleDrawEdges();
  });
  return false;
}

function canvasViewportInitializationKey(flow) {
  const flowPath = typeof state.flowPath === "string" ? state.flowPath : "";
  const flowId = typeof flow?.flowId === "string" ? flow.flowId : "";
  return flowPath || flowId ? `${flowPath}:${flowId}` : "";
}

function fitCanvasViewportToContent() {
  const canvas = document.getElementById("canvas");
  const bounds = collectCanvasContentBounds();
  const nextViewport = canvasViewportFitForBounds(bounds, {
    width: canvas?.clientWidth,
    height: canvas?.clientHeight
  }, INITIAL_VIEWPORT_FIT_PADDING);
  if (!nextViewport) {
    return false;
  }
  zoom = nextViewport.zoom;
  camera = nextViewport.camera;
  return true;
}

function collectCanvasContentBounds() {
  const cards = Array.from(document.querySelectorAll(".project-overview-card, .app-surface-card, .node-card"));
  const items = cards.map(cardBounds).filter(Boolean);
  return boundsForRects(items);
}

function cardBounds(card) {
  const x = finiteNumberOr(Number.parseFloat(card.style.left), card.offsetLeft);
  const y = finiteNumberOr(Number.parseFloat(card.style.top), card.offsetTop);
  const rect = card.getBoundingClientRect?.();
  const width = finitePositiveNumberOr(card.offsetWidth, rect?.width);
  const height = finitePositiveNumberOr(card.offsetHeight, rect?.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return { x, y, width, height };
}

function boundsForRects(rects) {
  if (!Array.isArray(rects) || rects.length === 0) {
    return null;
  }
  return rects.reduce((bounds, rect) => ({
    minX: Math.min(bounds.minX, rect.x),
    minY: Math.min(bounds.minY, rect.y),
    maxX: Math.max(bounds.maxX, rect.x + rect.width),
    maxY: Math.max(bounds.maxY, rect.y + rect.height)
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  });
}

function canvasViewportFitForBounds(bounds, viewport, padding = INITIAL_VIEWPORT_FIT_PADDING) {
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    !isFiniteBounds(bounds)
  ) {
    return null;
  }
  const safePadding = Math.max(0, Number.isFinite(Number(padding)) ? Number(padding) : 0);
  const minX = bounds.minX - safePadding;
  const minY = bounds.minY - safePadding;
  const width = Math.max(1, bounds.maxX - bounds.minX + safePadding * 2);
  const height = Math.max(1, bounds.maxY - bounds.minY + safePadding * 2);
  const nextZoom = clamp(Math.min(1, viewportWidth / width, viewportHeight / height), MIN_ZOOM, MAX_ZOOM);
  return {
    zoom: nextZoom,
    camera: {
      x: Math.round((viewportWidth - width * nextZoom) / 2 - minX * nextZoom),
      y: Math.round((viewportHeight - height * nextZoom) / 2 - minY * nextZoom)
    }
  };
}

function canvasViewportFocusForCard(card, viewport, padding = RELATION_CARD_FOCUS_PADDING) {
  const viewportWidth = Number(viewport?.width);
  const viewportHeight = Number(viewport?.height);
  const cardX = Number(card?.x);
  const cardY = Number(card?.y);
  const cardWidth = Number(card?.width);
  const cardHeight = Number(card?.height);
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    !Number.isFinite(cardX) ||
    !Number.isFinite(cardY) ||
    !Number.isFinite(cardWidth) ||
    !Number.isFinite(cardHeight) ||
    cardWidth <= 0 ||
    cardHeight <= 0
  ) {
    return null;
  }
  const safePadding = Math.max(0, Number.isFinite(Number(padding)) ? Number(padding) : 0);
  const availableWidth = Math.max(1, viewportWidth - safePadding * 2);
  const availableHeight = Math.max(1, viewportHeight - safePadding * 2);
  const nextZoom = clamp(Math.min(1, availableWidth / cardWidth, availableHeight / cardHeight), MIN_ZOOM, MAX_ZOOM);
  return {
    zoom: nextZoom,
    camera: {
      x: Math.round(viewportWidth / 2 - (cardX + cardWidth / 2) * nextZoom),
      y: Math.round(viewportHeight / 2 - (cardY + cardHeight / 2) * nextZoom)
    }
  };
}

function canvasViewportAnimationDuration(from, to) {
  const panDistance = Math.hypot(
    Number(to?.camera?.x) - Number(from?.camera?.x),
    Number(to?.camera?.y) - Number(from?.camera?.y)
  );
  const zoomDistance = Math.abs(Number(to?.zoom) - Number(from?.zoom)) * CAMERA_ANIMATION_ZOOM_DISTANCE;
  const distance = Number.isFinite(panDistance + zoomDistance) ? panDistance + zoomDistance : 0;
  return Math.round(clamp(
    CAMERA_ANIMATION_MIN_DURATION_MS + distance * CAMERA_ANIMATION_DISTANCE_FACTOR,
    CAMERA_ANIMATION_MIN_DURATION_MS,
    CAMERA_ANIMATION_MAX_DURATION_MS
  ));
}

function canvasViewportAnimationState(from, to, progress) {
  const normalized = clamp(Number(progress), 0, 1);
  const eased = 1 - Math.pow(1 - normalized, 3);
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
    camera: {
      x: from.camera.x + (to.camera.x - from.camera.x) * eased,
      y: from.camera.y + (to.camera.y - from.camera.y) * eased
    }
  };
}

function canvasViewportAnimationIsSettled(from, to) {
  return (
    Math.abs(to.zoom - from.zoom) < 0.001 &&
    Math.abs(to.camera.x - from.camera.x) < 0.5 &&
    Math.abs(to.camera.y - from.camera.y) < 0.5
  );
}

function prefersReducedCanvasMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function animateCanvasViewport(nextViewport) {
  cancelCanvasViewportAnimation(false);
  const initialViewport = {
    zoom,
    camera: { x: camera.x, y: camera.y }
  };
  if (prefersReducedCanvasMotion() || canvasViewportAnimationIsSettled(initialViewport, nextViewport)) {
    applyCanvasViewport(nextViewport);
    return;
  }
  const duration = canvasViewportAnimationDuration(initialViewport, nextViewport);
  const startedAt = performance.now();
  const step = (timestamp) => {
    const progress = clamp((timestamp - startedAt) / duration, 0, 1);
    const frameViewport = progress >= 1
      ? nextViewport
      : canvasViewportAnimationState(initialViewport, nextViewport, progress);
    zoom = frameViewport.zoom;
    camera = frameViewport.camera;
    const complete = progress >= 1;
    if (complete) {
      canvasViewportAnimationFrame = null;
    }
    applyCamera({ persist: complete });
    scheduleDrawEdges();
    if (!complete) {
      canvasViewportAnimationFrame = requestAnimationFrame(step);
    }
  };
  canvasViewportAnimationFrame = requestAnimationFrame(step);
}

function cancelCanvasViewportAnimation(persist = true) {
  if (canvasViewportAnimationFrame === null) {
    return false;
  }
  cancelAnimationFrame(canvasViewportAnimationFrame);
  canvasViewportAnimationFrame = null;
  if (persist) {
    applyCamera();
    scheduleDrawEdges();
  }
  return true;
}

function applyCanvasViewport(nextViewport) {
  zoom = nextViewport.zoom;
  camera = nextViewport.camera;
  applyCamera();
  scheduleDrawEdges();
}

function isFiniteBounds(bounds) {
  return Boolean(
    bounds &&
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY) &&
    bounds.maxX >= bounds.minX &&
    bounds.maxY >= bounds.minY
  );
}

function finiteNumberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function finitePositiveNumberOr(value, fallback) {
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return Number.isFinite(fallback) && fallback > 0 ? fallback : Number.NaN;
}

function applyCamera(options: { persist?: boolean } = {}) {
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
  if (options.persist !== false) {
    persistUiState();
  }
}

function shouldLetPanelHandleWheel(target) {
  return Boolean(target?.closest?.(".floating-taxonomy-controls, .floating-taxonomy-panels, .selection-relations-panel"));
}

function handleWheel(event) {
  if (shouldLetPanelHandleWheel(event.target)) {
    return;
  }
  event.preventDefault();
  cancelCanvasViewportAnimation();
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
