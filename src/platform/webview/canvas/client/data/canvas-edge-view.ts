// @ts-nocheck
function scheduleDrawEdges() {
  if (framePending) {
    return;
  }
  framePending = true;
  requestAnimationFrame(() => {
    framePending = false;
    drawEdges();
  });
}

function drawEdges() {
  const svg = document.getElementById("edgeLayer");
  const canvas = document.getElementById("canvas");
  if (!svg || !canvas) {
    return;
  }
  svg.setAttribute("width", String(canvas.clientWidth));
  svg.setAttribute("height", String(canvas.clientHeight));
  const edgesHtml = state.flow.edges
    .filter((edge) => edge.status === "active")
    .map((edge) => renderEdge(edge))
    .join("");
  svg.innerHTML = `${renderProjectOverviewSystemEdges(state.flow)}${edgesHtml}${renderConnectionPreview()}`;
}

function renderProjectOverviewSystemEdges(flow) {
  return (flow.appSurfaces || []).map((surface) => renderProjectOverviewSystemEdge(surface)).join("");
}

function renderProjectOverviewSystemEdge(surface) {
  const from = getProjectOverviewAppSystemPoint(surface.appId);
  const to = getEndpointScreenPoint({ kind: "appSurface", nodeId: surface.appId, appId: surface.appId }, "to");
  if (!from || !to) {
    return "";
  }
  const curve = Math.max(70, Math.abs(to.x - from.x) * 0.42);
  const d = `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
  return `
    <g class="project-overview-system-edge">
      <path class="edge-path" d="${d}"></path>
    </g>
  `;
}

function getProjectOverviewAppSystemPoint(appId) {
  const dot = document.querySelector(`.project-overview-system-dot[data-project-overview-app-id="${cssEscape(appId)}"]`);
  const canvas = document.getElementById("canvas");
  if (!dot || !canvas) {
    return null;
  }
  const rect = dot.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - canvasRect.left,
    y: rect.top + rect.height / 2 - canvasRect.top,
    related: true
  };
}

function getAppSurfaceEntryNodes(flow, appId) {
  return flow.nodes.filter((node) =>
    node.status !== "removed" &&
    nodeBelongsToAppSurface(node, appId) &&
    isAppSurfaceEntryNode(flow, node, appId)
  );
}

function isAppSurfaceEntryNode(flow, node, appId) {
  return !flow.edges.some((edge) => {
    if (edge.status !== "active" || edge.toNodeId !== node.nodeId) {
      return false;
    }
    const fromNode = flow.nodes.find((candidate) => candidate.nodeId === edge.fromNodeId);
    return fromNode ? nodeBelongsToAppSurface(fromNode, appId) : false;
  });
}

function nodeBelongsToAppSurface(node, appId) {
  return !Array.isArray(node.appSurfaceIds) || node.appSurfaceIds.length === 0 || node.appSurfaceIds.includes(appId);
}

function renderEdge(edge) {
  const fromEndpoint = edge.from || { kind: "node", nodeId: edge.fromNodeId };
  const toEndpoint = edge.to || { kind: "node", nodeId: edge.toNodeId };
  const from = getEndpointScreenPoint(fromEndpoint, "from");
  const to = getEndpointScreenPoint(toEndpoint, "to") || getEndpointScreenPoint({ kind: "node", nodeId: edge.toNodeId }, "to");
  if (!from || !to) {
    return "";
  }
  const active = isEdgeRelated(edge) && from.related && to.related;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const curve = Math.max(80, Math.abs(to.x - from.x) * 0.45);
  const d = `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
  return `
    <g class="edge edge-type-${edgeTypeGroup(edge.type)} ${active ? "" : "dimmed"} ${selectedEdgeId === edge.edgeId ? "selected" : ""}">
      <path class="edge-hitarea" data-edge-id="${escapeAttr(edge.edgeId)}" d="${d}"></path>
      <path class="edge-path" data-edge-id="${escapeAttr(edge.edgeId)}" d="${d}"></path>
      <circle class="edge-endpoint outlet-end" data-edge-id="${escapeAttr(edge.edgeId)}" data-edge-end="from" cx="${from.x}" cy="${from.y}" r="5"></circle>
      <circle class="edge-endpoint inlet-end" data-edge-id="${escapeAttr(edge.edgeId)}" data-edge-end="to" cx="${to.x}" cy="${to.y}" r="5"></circle>
      <text class="edge-label" data-edge-id="${escapeAttr(edge.edgeId)}" x="${midX}" y="${midY - 8}">${escapeHtml(edge.trigger || edge.action)}</text>
    </g>
  `;
}

function renderConnectionPreview() {
  if (!connectionDrag) {
    return "";
  }
  const from = connectionDrag.direction === "from" ? connectionDrag.start : connectionDrag.current;
  const to = connectionDrag.direction === "from" ? connectionDrag.current : connectionDrag.start;
  const curve = Math.max(60, Math.abs(to.x - from.x) * 0.45);
  const d = `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
  return `
    <g class="connection-preview">
      <path class="connection-preview-path" d="${d}"></path>
      <circle class="connection-preview-end" cx="${to.x}" cy="${to.y}" r="5"></circle>
    </g>
  `;
}

function getEndpointScreenPoint(endpoint, direction) {
  const key = endpointKey(endpoint);
  let element = document.querySelector(`[data-origin-key="${cssEscape(key)}"]`);
  if (direction === "to") {
    element = document.querySelector(`.target-dot[data-target-key="${cssEscape(key)}"]`) ||
      document.querySelector(`.target-dot[data-target-node-id="${cssEscape(endpoint.nodeId || "")}"]`) ||
      element;
  }
  if (element) {
    const canvas = document.getElementById("canvas");
    if (!canvas) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const card = element.closest(".node-card, .app-surface-card, .project-overview-card");
    const cardRect = card?.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const x = cardRect
      ? (direction === "to" ? cardRect.left - 1 : cardRect.right + 1)
      : rect.left + rect.width / 2;
    return {
      x: x - canvasRect.left,
      y: rect.top + rect.height / 2 - canvasRect.top,
      related: !card?.classList.contains("dimmed")
    };
  }
  if (endpoint.kind === "projectOverview") {
    const pos = projectOverviewPosition;
    if (!pos) {
      return null;
    }
    const x = direction === "to" ? pos.x : pos.x + PROJECT_OVERVIEW_WIDTH;
    return {
      ...worldToScreen({ x, y: pos.y + 46 }),
      related: true
    };
  }
  if (endpoint.kind === "appSurface") {
    const appId = endpointEntityId(endpoint);
    const surface = (state.flow.appSurfaces || []).find((item) => item.appId === appId);
    const pos = appSurfacePositions.get(appId);
    if (!surface || !pos) {
      return null;
    }
    return {
      ...worldToScreen({ x: pos.x + CARD_WIDTH / 2, y: pos.y + 70 }),
      related: isAppSurfaceRelated(surface)
    };
  }
  const node = state.flow.nodes.find((item) => item.nodeId === endpoint.nodeId);
  const pos = node ? nodePositions.get(node.nodeId) : null;
  if (!node || !pos) {
    return null;
  }
  return {
    ...worldToScreen({ x: pos.x + CARD_WIDTH / 2, y: pos.y + CARD_MIN_HEIGHT / 2 }),
    related: isNodeRelated(node)
  };
}

function screenToWorld(clientX, clientY) {
  const canvas = document.getElementById("canvas");
  if (!canvas) {
    return { x: 0, y: 0 };
  }
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - camera.x) / zoom,
    y: (clientY - rect.top - camera.y) / zoom
  };
}

function worldToScreen(point) {
  return {
    x: point.x * zoom + camera.x,
    y: point.y * zoom + camera.y
  };
}
