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
