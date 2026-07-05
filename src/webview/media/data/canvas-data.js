function getFeatureGroups(node) {
  if (Array.isArray(node.featureGroups) && node.featureGroups.length > 0) {
    return node.featureGroups;
  }
  if (!Array.isArray(node.elements) || node.elements.length === 0) {
    return [];
  }
  return [
    {
      groupId: `group_legacy_${node.nodeId}`,
      name: "页面元素",
      type: "legacyElements",
      description: "由页面元素字段兼容展示。",
      items: node.elements.map((element) => ({
        itemId: `item_legacy_${element.elementId}`,
        name: element.name,
        type: element.type,
        description: element.description,
        dataBinding: element.dataBinding,
        required: element.required
      }))
    }
  ];
}

function getAvailableDomains(flow) {
  if (appFilters.length === 0) {
    return flow.domains;
  }
  const selectedSurfaces = (flow.appSurfaces || []).filter((item) => appFilters.includes(item.appId));
  const domainIds = new Set(selectedSurfaces.flatMap((surface) => surface.domainIds || []));
  return domainIds.size > 0 ? flow.domains.filter((domain) => domainIds.has(domain.domainId)) : flow.domains;
}

function getAvailableRoles(flow) {
  const selectedSurfaces = appFilters.length > 0
    ? (flow.appSurfaces || []).filter((item) => appFilters.includes(item.appId))
    : [];
  const appRoleIds = new Set(selectedSurfaces.flatMap((surface) => surface.roleIds || []));
  return flow.roles.filter((role) => {
    const appOk = appFilters.length === 0 || appRoleIds.size === 0 || appRoleIds.has(role.roleId);
    const domainOk = domainFilters.length === 0 || intersects(role.domainIds || [], domainFilters);
    return appOk && domainOk;
  });
}

function normalizeFilters() {
  const flow = state.flow;
  const activeNodeIds = new Set(flow.nodes.filter((node) => node.status !== "removed").map((node) => node.nodeId));
  selectedNodeIds = selectedNodeIds.filter((id) => activeNodeIds.has(id));
  if (selectedNodeIds.length === 0 && selectedNodeId && activeNodeIds.has(selectedNodeId)) {
    selectedNodeIds = [selectedNodeId];
  } else if (!selectedNodeIds.includes(selectedNodeId)) {
    selectedNodeId = selectedNodeIds[0] || "";
  }
  appFilters = appFilters.filter((id) => (flow.appSurfaces || []).some((surface) => surface.appId === id));
  domainFilters = domainFilters.filter((id) => getAvailableDomains(flow).some((domain) => domain.domainId === id));
  roleFilters = roleFilters.filter((id) => getAvailableRoles(flow).some((role) => role.roleId === id));
  taxonomySelection = {
    appSurface: normalizeTaxonomySelection(flow, "appSurface", taxonomySelection.appSurface),
    domain: normalizeTaxonomySelection(flow, "domain", taxonomySelection.domain),
    role: normalizeTaxonomySelection(flow, "role", taxonomySelection.role),
    statusGroup: normalizeTaxonomySelection(flow, "statusGroup", taxonomySelection.statusGroup)
  };
  if (selectedAppSurfaceId && !(flow.appSurfaces || []).some((surface) => surface.appId === selectedAppSurfaceId)) {
    selectedAppSurfaceId = "";
  }
  if (selectedDomainId && !(flow.domains || []).some((domain) => domain.domainId === selectedDomainId)) {
    selectedDomainId = "";
  }
  if (selectedRoleId && !(flow.roles || []).some((role) => role.roleId === selectedRoleId)) {
    selectedRoleId = "";
  }
  if (selectedStatusGroupId && !getStatusGroup(flow, selectedStatusGroupId)) {
    selectedStatusGroupId = "";
  }
}

function isNodeRelated(node) {
  const appOk = appFilters.length === 0 || !Array.isArray(node.appSurfaceIds) || node.appSurfaceIds.length === 0 || intersects(node.appSurfaceIds, appFilters);
  const domainOk = domainFilters.length === 0 || intersects(node.domainIds || [], domainFilters);
  const roleOk = roleFilters.length === 0 || intersects(node.roleIds || [], roleFilters);
  return appOk && domainOk && roleOk;
}

function isEdgeRelated(edge) {
  const fromEndpoint = edge.from || { kind: "node", nodeId: edge.fromNodeId };
  const toEndpoint = edge.to || { kind: "node", nodeId: edge.toNodeId };
  const endpointAppIds = [...endpointAppSurfaceIds(fromEndpoint), ...endpointAppSurfaceIds(toEndpoint)];
  const endpointDomainIds = [...endpointDomainSelectionIds(fromEndpoint), ...endpointDomainSelectionIds(toEndpoint)];
  const endpointRoleIds = [...endpointRoleSelectionIds(fromEndpoint), ...endpointRoleSelectionIds(toEndpoint)];
  const appOk = appFilters.length === 0 || intersects(edge.appSurfaceIds || [], appFilters) || intersects(endpointAppIds, appFilters);
  const domainOk = domainFilters.length === 0 || intersects(edge.domainIds || [], domainFilters) || intersects(endpointDomainIds, domainFilters);
  const roleOk = roleFilters.length === 0 || intersects(edge.roleIds || [], roleFilters) || intersects(endpointRoleIds, roleFilters);
  return appOk && domainOk && roleOk;
}

function getEntryAppSurfaceNames(flow, node) {
  const entryIds = getEntryAppSurfaceIds(flow, node);
  if (entryIds.length === 0) {
    return "";
  }
  const surfaces = flow.appSurfaces || [];
  return entryIds
    .map((appId) => surfaces.find((surface) => surface.appId === appId)?.name || appId || "全部应用端")
    .join(" / ");
}

function getEntryAppSurfaceIds(flow, node) {
  const nodeAppIds = Array.isArray(node.appSurfaceIds) && node.appSurfaceIds.length > 0 ? node.appSurfaceIds : [""];
  return nodeAppIds.filter((appId) => {
    return !flow.edges.some((edge) => {
      if (edge.status !== "active" || edge.toNodeId !== node.nodeId) {
        return false;
      }
      if (edge.from?.kind === "appSurface") {
        const edgeAppId = endpointEntityId(edge.from);
        return !appId || edgeAppId === appId;
      }
      if (!appId) {
        return true;
      }
      const fromNode = flow.nodes.find((item) => item.nodeId === edge.fromNodeId);
      return Array.isArray(fromNode?.appSurfaceIds) && fromNode.appSurfaceIds.includes(appId);
    });
  });
}

function isNodeRelatedByApp(node) {
  return appFilters.length === 0 || !Array.isArray(node.appSurfaceIds) || node.appSurfaceIds.length === 0 || intersects(node.appSurfaceIds, appFilters);
}

function endpointNode(endpoint) {
  return endpoint.kind === "appSurface" || endpoint.kind === "projectOverview"
    ? null
    : state.flow.nodes.find((node) => node.nodeId === endpoint.nodeId);
}

function endpointAppSurface(endpoint) {
  return endpoint.kind === "appSurface"
    ? (state.flow.appSurfaces || []).find((surface) => surface.appId === endpointEntityId(endpoint))
    : null;
}

function endpointAppSurfaceIds(endpoint) {
  const surface = endpointAppSurface(endpoint);
  if (surface) {
    return [surface.appId];
  }
  const node = endpointNode(endpoint);
  return node?.appSurfaceIds || [];
}

function endpointDomainSelectionIds(endpoint) {
  const surface = endpointAppSurface(endpoint);
  if (surface) {
    return surface.domainIds || [];
  }
  const node = endpointNode(endpoint);
  return node?.domainIds || [];
}

function endpointRoleSelectionIds(endpoint) {
  const surface = endpointAppSurface(endpoint);
  if (surface) {
    return surface.roleIds || [];
  }
  const node = endpointNode(endpoint);
  return node?.roleIds || [];
}

function isAppSurfaceRelated(surface) {
  const appOk = appFilters.length === 0 || appFilters.includes(surface.appId);
  const domainOk = domainFilters.length === 0 || intersects(surface.domainIds || [], domainFilters);
  const roleOk = roleFilters.length === 0 || intersects(surface.roleIds || [], roleFilters);
  return appOk && domainOk && roleOk;
}

function normalizeTaxonomySelection(flow, kind, id) {
  return id && getTaxonomyItems(flow, kind).some((item) => getTaxonomyId(kind, item) === id) ? id : "";
}

function intersects(left, right) {
  const rightSet = new Set(right || []);
  return (left || []).some((value) => rightSet.has(value));
}

function getTaxonomyItems(flow, kind) {
  if (kind === "appSurface") return flow.appSurfaces || [];
  if (kind === "domain") return flow.domains || [];
  if (kind === "statusGroup") return getStatusGroups(flow);
  return flow.roles || [];
}

function getTaxonomyId(kind, item) {
  if (kind === "appSurface") return item.appId;
  if (kind === "domain") return item.domainId;
  if (kind === "statusGroup") return item.statusGroupId;
  return item.roleId;
}

function getStatusGroups(flow) {
  return Array.isArray(flow.statusGroups) ? flow.statusGroups : [];
}

function getStatusGroup(flow, statusGroupId) {
  return statusGroupId ? getStatusGroups(flow).find((group) => group.statusGroupId === statusGroupId) || null : null;
}

function normalizeStatusGroupColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(color || "").trim()) ? String(color).trim() : "#6b7280";
}

function applyStatusGroupColorSwatches(root = document) {
  root.querySelectorAll(".status-group-color-square[data-status-group-color]").forEach((swatch) => {
    const color = normalizeStatusGroupColor(swatch.dataset.statusGroupColor);
    swatch.style.backgroundColor = color;
    swatch.style.borderColor = color;
  });
}

function applyEdgeTypeColorSwatches(root = document) {
  root.querySelectorAll(".edge-type-swatch[data-edge-type-color]").forEach((swatch) => {
    const color = String(swatch.dataset.edgeTypeColor || "").trim() || "var(--vscode-charts-blue, #3794ff)";
    swatch.style.background = color;
    swatch.style.borderColor = color;
  });
}

function randomStatusGroupColor(existingGroups = []) {
  const usedColors = new Set(existingGroups.map((group) => normalizeStatusGroupColor(group.color).toLowerCase()));
  const hue = Math.floor(Math.random() * 360);
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const color = hslToHex((hue + attempt * 37) % 360, 68, 54);
    if (!usedColors.has(color)) {
      return color;
    }
  }
  return hslToHex(hue, 68, 54);
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60
    ? [c, x, 0]
    : hue < 120
      ? [x, c, 0]
      : hue < 180
        ? [0, c, x]
        : hue < 240
          ? [0, x, c]
          : hue < 300
            ? [x, 0, c]
            : [c, 0, x];
  return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function namesByIds(items, idKey, ids) {
  return ids
    .map((id) => items.find((item) => item[idKey] === id)?.name || id)
    .filter(Boolean)
    .join(" / ");
}

function collectMultiSelect(id) {
  const select = document.getElementById(id);
  return Array.from(select?.selectedOptions || []).map((option) => option.value);
}

function collectTagMultiSelect(id) {
  return Array.from(document.querySelectorAll(`#${cssEscape(id)} input[type="checkbox"]:checked`))
    .map((input) => input.value);
}

function readIdSelection(value, legacyValue) {
  if (Array.isArray(value)) {
    return uniqueStringIds(value);
  }
  return typeof legacyValue === "string" && legacyValue.trim() ? [legacyValue.trim()] : [];
}

function uniqueStringIds(value) {
  return Array.from(new Set((value || []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())));
}

function readTaxonomySelection(value) {
  return {
    appSurface: typeof value?.appSurface === "string" ? value.appSurface : "",
    domain: typeof value?.domain === "string" ? value.domain : "",
    role: typeof value?.role === "string" ? value.role : "",
    statusGroup: typeof value?.statusGroup === "string" ? value.statusGroup : ""
  };
}

function readTaxonomyPanelsOpen() {
  const value = persisted.taxonomyPanelsOpen || {};
  return {
    appSurface: value.appSurface === true,
    domain: value.domain === true,
    role: value.role === true,
    statusGroup: value.statusGroup === true
  };
}

function readInspectorScrollState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((result, [key, scrollTop]) => {
    const normalized = Number(scrollTop);
    if (typeof key === "string" && key && Number.isFinite(normalized) && normalized >= 0) {
      result[key] = Math.round(normalized);
    }
    return result;
  }, {});
}

function inspectorScrollKey(kind, id) {
  return `${kind}:${id || ""}`;
}

function currentInspectorScrollKey() {
  const form = document.querySelector(".inspector .details-form[data-inspector-key]");
  return typeof form?.dataset.inspectorKey === "string" ? form.dataset.inspectorKey : "";
}

function persistCurrentInspectorScroll() {
  const inspector = document.querySelector(".inspector");
  const key = currentInspectorScrollKey();
  if (!inspector || !key) {
    return;
  }
  const scrollTop = Math.max(0, Math.round(inspector.scrollTop));
  if (inspectorScrollState[key] === scrollTop) {
    return;
  }
  inspectorScrollState = {
    ...inspectorScrollState,
    [key]: scrollTop
  };
  persistUiState();
}

function restoreInspectorScroll() {
  const inspector = document.querySelector(".inspector");
  const key = currentInspectorScrollKey();
  const scrollTop = Number(inspectorScrollState[key]);
  if (!inspector || !key || !Number.isFinite(scrollTop)) {
    return;
  }
  const restore = () => {
    inspector.scrollTop = scrollTop;
  };
  restore();
  requestAnimationFrame(restore);
}

function makeClientId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function handleHostMessage(message) {
  if (!message || message.type !== "commandResult") {
    return;
  }
  const replacementFlow = message.flow && typeof message.flow === "object" ? message.flow : null;
  if (replacementFlow) {
    state.flow = replacementFlow;
    resetLayoutCaches();
  }
  setCommandStatus(message.ok === true, typeof message.message === "string" ? message.message : "");
  if (replacementFlow) {
    render();
  } else {
    updateCommandStatusElement();
  }
}

function setCommandStatus(ok, message) {
  clearTimeout(commandStatusTimer);
  commandStatus = {
    kind: ok ? "ok" : "error",
    message: message || (ok ? "修改已写入 VS Code 文档缓冲区。" : "操作失败，文档未更新。"),
    at: Date.now()
  };
  persistUiState();
  if (ok) {
    commandStatusTimer = setTimeout(() => {
      commandStatus = null;
      persistUiState();
      updateCommandStatusElement();
    }, 2600);
  }
}

function updateCommandStatusElement() {
  const existing = document.getElementById("commandStatus");
  if (!commandStatus) {
    existing?.remove();
    return;
  }
  const canvas = document.getElementById("canvas");
  if (!canvas) {
    return;
  }
  const container = existing || document.createElement("div");
  container.id = "commandStatus";
  container.className = `command-status ${commandStatus.kind}`;
  container.setAttribute("role", "status");
  container.textContent = commandStatus.message;
  if (!existing) {
    canvas.appendChild(container);
  }
}

function resetLayoutCaches() {
  nodePositions.clear();
  appSurfacePositions.clear();
  projectOverviewPosition = null;
}

function readCommandStatus(value) {
  if (!value || (value.kind !== "ok" && value.kind !== "error") || typeof value.message !== "string") {
    return null;
  }
  const at = Number(value.at);
  if (!Number.isFinite(at)) {
    return null;
  }
  if (value.kind === "ok" && Date.now() - at > 3000) {
    return null;
  }
  return {
    kind: value.kind,
    message: value.message,
    at
  };
}

function persistUiState() {
  vscode.setState({
    appFilters,
    domainFilters,
    roleFilters,
    taxonomyPanelsOpen,
    taxonomySelection,
    selectedProjectOverview,
    selectedNodeId,
    selectedNodeIds,
    selectedAppSurfaceId,
    selectedDomainId,
    selectedRoleId,
    selectedStatusGroupId,
    nodeSearch,
    leftPanelCollapsed,
    zoom,
    camera,
    connectingFrom,
    pendingEdgeDetailsSaves,
    inspectorScrollState,
    commandStatus
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
