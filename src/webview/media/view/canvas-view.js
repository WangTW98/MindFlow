function refreshCanvasAndNodeList() {
  const flow = state.flow;
  seedProjectOverviewPosition(flow);
  seedNodePositions(flow);
  seedAppSurfacePositions(flow);
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
    vscode.postMessage({ type: "selectNode", nodeId: selectedNodeId });
  } else {
    vscode.postMessage({ type: "clearSelection" });
  }
  render();
  requestAnimationFrame(() => {
    focusCanvas();
    if (center && selectedNodeIds.includes(nodeId)) {
      centerNode(nodeId);
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
  vscode.postMessage({ type: "selectEdge", edgeId });
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
  vscode.postMessage({ type: "selectAppSurface", appId });
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
  vscode.postMessage({ type: "selectStatusGroup", statusGroupId });
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
  vscode.postMessage({ type: "selectProjectOverview" });
  render();
  requestAnimationFrame(() => focusCanvas());
}

function focusCanvas() {
  document.getElementById("canvas")?.focus({ preventScroll: true });
}

function centerNode(nodeId) {
  const canvas = document.getElementById("canvas");
  const card = document.querySelector(`.node-card[data-node-id="${cssEscape(nodeId)}"]`);
  const pos = nodePositions.get(nodeId);
  if (!canvas || !card || !pos) {
    return;
  }
  camera.x = canvas.clientWidth / 2 - (pos.x + card.offsetWidth / 2) * zoom;
  camera.y = canvas.clientHeight / 2 - (pos.y + card.offsetHeight / 2) * zoom;
  applyCamera();
  scheduleDrawEdges();
}

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
    const rect = element.getBoundingClientRect();
    const card = element.closest(".node-card, .app-surface-card, .project-overview-card");
    const cardRect = card?.getBoundingClientRect();
    const canvasRect = document.getElementById("canvas").getBoundingClientRect();
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
  const rect = document.getElementById("canvas").getBoundingClientRect();
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

function endpointFromButton(button) {
  if (button.dataset.originKind === "projectOverview") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  if (button.dataset.originKind === "appSurface") {
    const appId = button.dataset.originAppId || button.dataset.originNodeId;
    return { kind: "appSurface", nodeId: appId, appId };
  }
  const endpoint = {
    kind: button.dataset.originKind,
    nodeId: button.dataset.originNodeId
  };
  if (button.dataset.originGroupId) {
    endpoint.groupId = button.dataset.originGroupId;
  }
  if (button.dataset.originItemId) {
    endpoint.itemId = button.dataset.originItemId;
  }
  return endpoint;
}

function endpointFromTargetButton(button) {
  if (button.dataset.targetKind === "projectOverview") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  if (button.dataset.targetKind === "appSurface") {
    const appId = button.dataset.targetAppId || button.dataset.targetNodeId;
    return appId ? { kind: "appSurface", nodeId: appId, appId } : null;
  }
  const nodeId = button.dataset.targetNodeId;
  return nodeId ? { kind: "node", nodeId } : null;
}

function endpointKey(endpoint) {
  return `${endpoint.kind}:${endpointEntityId(endpoint)}:${endpoint.groupId || ""}:${endpoint.itemId || ""}`;
}

function encodeEndpoint(endpoint) {
  return [endpoint.kind, endpointEntityId(endpoint), endpoint.groupId || "", endpoint.itemId || ""]
    .map((part) => encodeURIComponent(part))
    .join("|");
}

function parseEndpointValue(value) {
  const [kind, entityId, groupId, itemId] = String(value || "")
    .split("|")
    .map((part) => decodeURIComponent(part || ""));
  const endpoint = kind === "appSurface"
    ? { kind, nodeId: entityId, appId: entityId }
    : kind === "projectOverview"
      ? { kind, nodeId: PROJECT_OVERVIEW_NODE_ID }
    : { kind, nodeId: entityId };
  if (groupId) {
    endpoint.groupId = groupId;
  }
  if (itemId) {
    endpoint.itemId = itemId;
  }
  return endpoint;
}

function endpointDisplayLabel(flow, endpoint) {
  if (endpoint.kind === "projectOverview") {
    return `项目概述 · ${flow.title || "项目概述"}`;
  }
  if (endpoint.kind === "appSurface") {
    const appId = endpointEntityId(endpoint);
    const surface = (flow.appSurfaces || []).find((item) => item.appId === appId);
    return `应用端卡片 · ${surface?.name || appId || ""}`;
  }
  const node = flow.nodes.find((item) => item.nodeId === endpoint.nodeId);
  if (!node) {
    return endpoint.nodeId || "";
  }
  if (endpoint.kind === "node") {
    return `节点卡片 · ${node.title}`;
  }
  const group = getFeatureGroups(node).find((item) => item.groupId === endpoint.groupId);
  if (endpoint.kind === "featureGroup") {
    return `功能分组 · ${group?.name || endpoint.groupId || ""}`;
  }
  const item = group?.items?.find((candidate) => candidate.itemId === endpoint.itemId);
  return `功能项 · ${item?.name || endpoint.itemId || ""}`;
}

function endpointEntityId(endpoint) {
  if (endpoint.kind === "projectOverview") {
    return PROJECT_OVERVIEW_NODE_ID;
  }
  return endpoint.kind === "appSurface" ? endpoint.appId || endpoint.nodeId || "" : endpoint.nodeId || "";
}

function endpointSearchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterEndpointOptions(input) {
  const picker = input.closest(".endpoint-picker");
  if (!picker) {
    return;
  }
  openEndpointPicker(input);
}

function openEndpointPicker(input, showAll = false) {
  const picker = input.closest(".endpoint-picker");
  const menu = picker?.querySelector(".endpoint-menu");
  if (!picker || !menu) {
    return;
  }
  document.querySelectorAll(".endpoint-picker.open").forEach((item) => {
    if (item !== picker) {
      closeEndpointPicker(item);
    }
  });
  picker.classList.add("open");
  input.setAttribute("aria-expanded", "true");
  filterEndpointOptionsWithoutReopen(picker, showAll ? "" : input.value);
}

function filterEndpointOptionsWithoutReopen(picker, value) {
  const query = String(value || "").trim().toLowerCase();
  picker.querySelectorAll(".endpoint-menu > .endpoint-option").forEach((option) => {
    option.hidden = !endpointOptionMatches(option, query);
  });
  picker.querySelectorAll(".endpoint-cascade-node").forEach((nodeElement) => {
    const nodeButton = nodeElement.querySelector(":scope > .endpoint-option");
    const nodeMatches = endpointOptionMatches(nodeButton, query);
    let hasVisibleGroup = false;

    nodeElement.querySelectorAll(":scope > .endpoint-cascade-children > .endpoint-cascade-group").forEach((groupElement) => {
      const groupButton = groupElement.querySelector(":scope > .endpoint-option");
      const groupMatches = endpointOptionMatches(groupButton, query);
      let hasVisibleItem = false;

      groupElement.querySelectorAll(":scope > .endpoint-cascade-children > .endpoint-option").forEach((itemButton) => {
        const itemVisible = !query || nodeMatches || groupMatches || endpointOptionMatches(itemButton, query);
        itemButton.hidden = !itemVisible;
        hasVisibleItem = hasVisibleItem || itemVisible;
      });

      const groupVisible = !query || nodeMatches || groupMatches || hasVisibleItem;
      groupElement.hidden = !groupVisible;
      if (groupButton) {
        groupButton.hidden = !groupVisible;
      }
      hasVisibleGroup = hasVisibleGroup || groupVisible;
    });

    const nodeVisible = !query || nodeMatches || hasVisibleGroup;
    nodeElement.hidden = !nodeVisible;
    if (nodeButton) {
      nodeButton.hidden = !nodeVisible;
    }
  });
}

function endpointOptionMatches(option, query) {
  if (!query || !option) {
    return !query;
  }
  return `${option.dataset.search || ""} ${option.textContent || ""}`.toLowerCase().includes(query);
}

function closeEndpointPicker(picker) {
  const input = picker.querySelector(".endpoint-combobox-input");
  picker.classList.remove("open");
  if (input) {
    input.setAttribute("aria-expanded", "false");
    input.value = input.dataset.endpointLabel || input.value;
    filterEndpointOptionsWithoutReopen(picker, "");
  }
}

function selectEndpointOption(option) {
  const picker = option.closest(".endpoint-picker");
  const input = picker?.querySelector(".endpoint-combobox-input");
  if (!picker || !input) {
    return;
  }
  input.dataset.endpointValue = option.dataset.endpointValue || "";
  input.dataset.endpointLabel = option.dataset.endpointLabel || option.textContent || "";
  input.value = input.dataset.endpointLabel;
  picker.querySelectorAll(".endpoint-option.selected").forEach((item) => {
    item.classList.remove("selected");
    item.setAttribute("aria-selected", "false");
  });
  option.classList.add("selected");
  option.setAttribute("aria-selected", "true");
  closeEndpointPicker(picker);
  submitEdgeDetails({ immediate: true });
}

function toggleEdgeTypePicker(trigger) {
  const picker = trigger.closest(".edge-type-picker");
  if (!picker) {
    return;
  }
  const open = !picker.classList.contains("open");
  picker.classList.toggle("open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeEdgeTypePicker(picker) {
  picker.classList.remove("open");
  picker.querySelector(".edge-type-trigger")?.setAttribute("aria-expanded", "false");
}

function selectEdgeTypeOption(option) {
  const picker = option.closest(".edge-type-picker");
  const trigger = picker?.querySelector(".edge-type-trigger");
  if (!picker || !trigger) {
    return;
  }
  const type = getEdgeTypeOption(option.dataset.edgeTypeOption);
  trigger.dataset.edgeTypeValue = type.value;
  trigger.innerHTML = renderEdgeTypeOptionContent(type);
  applyEdgeTypeColorSwatches(trigger);
  picker.querySelectorAll(".edge-type-option.selected").forEach((item) => {
    item.classList.remove("selected");
    item.setAttribute("aria-selected", "false");
  });
  option.classList.add("selected");
  option.setAttribute("aria-selected", "true");
  closeEdgeTypePicker(picker);
  submitEdgeDetails({ immediate: true });
}

function togglePageTypePicker(trigger) {
  const picker = trigger.closest(".page-type-picker");
  if (!picker) {
    return;
  }
  const open = !picker.classList.contains("open");
  picker.classList.toggle("open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function closePageTypePicker(picker) {
  picker.classList.remove("open");
  picker.querySelector(".page-type-trigger")?.setAttribute("aria-expanded", "false");
}

function selectPageTypeOption(option) {
  const picker = option.closest(".page-type-picker");
  const trigger = picker?.querySelector(".page-type-trigger");
  const input = document.getElementById("nodePageType");
  if (!picker || !trigger || !input) {
    return;
  }
  const type = getPageTypeOption(option.dataset.pageTypeOption);
  input.value = type.value;
  trigger.dataset.pageTypeValue = type.value;
  trigger.innerHTML = renderPageTypeOptionContent(type);
  picker.querySelectorAll(".page-type-option.selected").forEach((item) => {
    item.classList.remove("selected");
    item.setAttribute("aria-selected", "false");
  });
  option.classList.add("selected");
  option.setAttribute("aria-selected", "true");
  closePageTypePicker(picker);
  commitNodeDetailsChange({ immediate: true });
}

function toggleAppSurfaceTypePicker(trigger) {
  const picker = trigger.closest(".app-surface-type-picker");
  if (!picker) {
    return;
  }
  const open = !picker.classList.contains("open");
  picker.classList.toggle("open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeAppSurfaceTypePicker(picker) {
  picker.classList.remove("open");
  picker.querySelector(".app-surface-type-trigger")?.setAttribute("aria-expanded", "false");
}

function selectAppSurfaceTypeOption(option) {
  const picker = option.closest(".app-surface-type-picker");
  const trigger = picker?.querySelector(".app-surface-type-trigger");
  const input = document.getElementById("appSurfaceType");
  if (!picker || !trigger || !input) {
    return;
  }
  const type = getAppSurfaceTypeOption(option.dataset.appSurfaceTypeOption);
  input.value = type.value;
  trigger.dataset.appSurfaceTypeValue = type.value;
  trigger.innerHTML = renderAppSurfaceTypeOptionContent(type);
  picker.querySelectorAll(".app-surface-type-option.selected").forEach((item) => {
    item.classList.remove("selected");
    item.setAttribute("aria-selected", "false");
  });
  option.classList.add("selected");
  option.setAttribute("aria-selected", "true");
  closeAppSurfaceTypePicker(picker);
  commitAppSurfaceDetailsChange({ immediate: true });
}

function toggleStatusGroupPicker(trigger) {
  const picker = trigger.closest(".status-group-picker");
  if (!picker) {
    return;
  }
  const open = !picker.classList.contains("open");
  picker.classList.toggle("open", open);
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeStatusGroupPicker(picker) {
  picker.classList.remove("open");
  picker.querySelector(".status-group-trigger")?.setAttribute("aria-expanded", "false");
}

function selectStatusGroupOption(option) {
  const picker = option.closest(".status-group-picker");
  const trigger = picker?.querySelector(".status-group-trigger");
  const input = document.getElementById("nodeStatusGroupId");
  if (!picker || !trigger || !input) {
    return;
  }
  const value = option.dataset.statusGroupOption || "";
  input.value = value;
  trigger.dataset.statusGroupValue = value;
  trigger.innerHTML = option.innerHTML;
  applyStatusGroupColorSwatches(trigger);
  picker.querySelectorAll(".status-group-option.selected").forEach((item) => {
    item.classList.remove("selected");
    item.setAttribute("aria-selected", "false");
  });
  option.classList.add("selected");
  option.setAttribute("aria-selected", "true");
  closeStatusGroupPicker(picker);
  commitNodeDetailsChange({ immediate: true });
}

function getAppSurfaceTypeOption(type) {
  const value = normalizeAppSurfaceTypeForSelect(type);
  return APP_SURFACE_TYPE_OPTIONS.find((option) => option.value === value) || APP_SURFACE_TYPE_OPTIONS[APP_SURFACE_TYPE_OPTIONS.length - 1];
}

function normalizeAppSurfaceTypeForSelect(type) {
  const value = String(type || "").trim().toLowerCase().replace(/\s+/g, "");
  if (value === "admin" || value === "backend" || value === "console" || value === "后台" || value === "管理后台") {
    return "admin";
  }
  if (value === "web" || value === "website" || value === "h5" || value === "网页" || value === "web端") {
    return "web";
  }
  if (value === "app" || value === "mobile" || value === "ios" || value === "android" || value === "移动端" || value === "app端") {
    return "app";
  }
  if (value === "miniapp" || value === "mini-app" || value === "miniprogram" || value === "小程序") {
    return "miniapp";
  }
  if (value === "desktop" || value === "pc" || value === "桌面端" || value === "客户端") {
    return "desktop";
  }
  return "other";
}

function getPageTypeOption(type) {
  const value = normalizePageTypeForSelect(type);
  return PAGE_TYPE_OPTIONS.find((option) => option.value === value) || PAGE_TYPE_OPTIONS[0];
}

function normalizePageTypeForSelect(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "popup" || value === "modal" || value === "dialog" || value === "弹窗") {
    return "popup";
  }
  if (value === "component" || value === "components" || value === "组件") {
    return "component";
  }
  if (value === "navigation" || value === "nav" || value === "menu" || value === "导航") {
    return "navigation";
  }
  if (value === "skeleton" || value === "wireframe" || value === "layout" || value === "骨架") {
    return "skeleton";
  }
  return "page";
}

function normalizeEdgeTypeForSelect(type) {
  const group = edgeTypeGroup(type);
  if (group === "status") return "statusChange";
  if (group === "nesting") return "nestedRelation";
  if (group === "auto") return "autoNavigate";
  if (group === "data") return "dataFlow";
  return "interaction";
}

function edgeTypeGroup(type) {
  if (type === "statusChange") {
    return "status";
  }
  if (type === "nestedRelation") {
    return "nesting";
  }
  if (type === "autoNavigate" || type === "navigate" || type === "branch") {
    return "auto";
  }
  if (type === "dataFlow" || type === "system") {
    return "data";
  }
  return "interaction";
}

function getEdgeTypeOption(value) {
  const normalizedValue = normalizeEdgeTypeForSelect(value);
  return EDGE_TYPE_OPTIONS.find((type) => type.value === normalizedValue) || EDGE_TYPE_OPTIONS[0];
}
