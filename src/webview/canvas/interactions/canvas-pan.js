function startPan(event) {
  if (
    connectionDrag ||
    (event.button !== 0 && event.button !== 1) ||
    event.target.closest(".project-overview-card") ||
    event.target.closest(".node-card") ||
    event.target.closest(".app-surface-card") ||
    event.target.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") ||
    event.target.closest(".selection-relations-panel") ||
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
