function cancelPendingTaxonomyDetailsSave(kind) {
  if (kind === "appSurface") {
    clearTimeout(appSurfaceDetailsSaveTimer);
    appSurfaceDetailsSaveTimer = null;
  } else if (kind === "domain") {
    clearTimeout(domainDetailsSaveTimer);
    domainDetailsSaveTimer = null;
  } else if (kind === "role") {
    clearTimeout(roleDetailsSaveTimer);
    roleDetailsSaveTimer = null;
  } else if (kind === "statusGroup") {
    clearTimeout(statusGroupDetailsSaveTimer);
    statusGroupDetailsSaveTimer = null;
  }
}

function isEditingTarget(target) {
  return Boolean(target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable='true']"));
}

function submitNodeDetails(event) {
  event?.preventDefault();
  commitNodeDetailsChange({ immediate: true });
}

function commitProjectOverviewDetailsChange(options = {}) {
  if (!selectedProjectOverview) {
    return;
  }
  const patch = collectProjectOverviewDetailsPatch();
  applyProjectOverviewDetailsLocally(patch);
  refreshProjectOverviewViews();
  if (options.localOnly) {
    clearTimeout(projectOverviewDetailsSaveTimer);
    projectOverviewDetailsSaveTimer = null;
    return;
  }
  if (options.immediate) {
    postProjectOverviewDetails(patch);
    return;
  }
  clearTimeout(projectOverviewDetailsSaveTimer);
  projectOverviewDetailsSaveTimer = setTimeout(() => postProjectOverviewDetails(patch), 250);
}

function collectProjectOverviewDetailsPatch() {
  return {
    title: document.getElementById("projectOverviewTitle").value,
    summary: document.getElementById("projectOverviewSummary").value,
    goal: document.getElementById("projectOverviewGoal").value
  };
}

function postProjectOverviewDetails(patch) {
  persistCurrentInspectorScroll();
  clearTimeout(projectOverviewDetailsSaveTimer);
  projectOverviewDetailsSaveTimer = null;
  vscode.postMessage({
    type: "updateProjectOverview",
    patch
  });
}

function commitNodeDetailsChange(options = {}) {
  if (!selectedNodeId || selectedNodeIds.length !== 1) {
    return;
  }
  const nodeId = selectedNodeId;
  const patch = collectNodeDetailsPatch();
  applyNodeDetailsLocally(nodeId, patch);
  refreshCanvasAndNodeList();
  if (options.localOnly) {
    clearTimeout(nodeDetailsSaveTimer);
    nodeDetailsSaveTimer = null;
    return;
  }
  if (options.immediate) {
    postNodeDetails(nodeId, patch);
    return;
  }
  clearTimeout(nodeDetailsSaveTimer);
  nodeDetailsSaveTimer = setTimeout(() => postNodeDetails(nodeId, patch), 250);
}

function collectNodeDetailsPatch() {
  return {
    title: document.getElementById("nodeTitle").value,
    pageType: document.getElementById("nodePageType").value,
    purpose: document.getElementById("nodePurpose").value,
    statusGroupId: document.getElementById("nodeStatusGroupId")?.value || "",
    appSurfaceIds: collectTagMultiSelect("nodeAppSurfaceIds"),
    domainIds: collectTagMultiSelect("nodeDomainIds"),
    roleIds: collectTagMultiSelect("nodeRoleIds"),
    featureGroups: collectFeatureGroups()
  };
}

function postNodeDetails(nodeId, patch) {
  persistCurrentInspectorScroll();
  clearTimeout(nodeDetailsSaveTimer);
  nodeDetailsSaveTimer = null;
  vscode.postMessage({
    type: "updateNodeDetails",
    nodeId,
    patch
  });
}

function commitAppSurfaceDetailsChange(options = {}) {
  if (!selectedAppSurfaceId) {
    return;
  }
  const appId = selectedAppSurfaceId;
  const item = collectAppSurfaceDetailsPatch();
  applyAppSurfaceDetailsLocally(appId, item);
  refreshAppSurfaceViews();
  if (options.localOnly) {
    clearTimeout(appSurfaceDetailsSaveTimer);
    appSurfaceDetailsSaveTimer = null;
    return;
  }
  if (options.immediate) {
    postAppSurfaceDetails(appId, item);
    return;
  }
  clearTimeout(appSurfaceDetailsSaveTimer);
  appSurfaceDetailsSaveTimer = setTimeout(() => postAppSurfaceDetails(appId, item), 250);
}

function collectAppSurfaceDetailsPatch() {
  return {
    appId: selectedAppSurfaceId,
    name: document.getElementById("appSurfaceName").value,
    type: document.getElementById("appSurfaceType").value,
    description: document.getElementById("appSurfaceDescription").value,
    domainIds: collectTagMultiSelect("appSurfaceDomainIds"),
    roleIds: collectTagMultiSelect("appSurfaceRoleIds")
  };
}

function postAppSurfaceDetails(appId, item) {
  clearTimeout(appSurfaceDetailsSaveTimer);
  appSurfaceDetailsSaveTimer = null;
  vscode.postMessage({
    type: "updateTaxonomy",
    request: {
      kind: "appSurface",
      action: "update",
      id: appId,
      item
    }
  });
}

function commitDomainDetailsChange(options = {}) {
  if (!selectedDomainId) {
    return;
  }
  const domainId = selectedDomainId;
  const item = collectDomainDetailsPatch();
  applyDomainDetailsLocally(domainId, item);
  refreshDomainViews();
  if (options.localOnly) {
    clearTimeout(domainDetailsSaveTimer);
    domainDetailsSaveTimer = null;
    return;
  }
  if (options.immediate) {
    postDomainDetails(domainId, item);
    return;
  }
  clearTimeout(domainDetailsSaveTimer);
  domainDetailsSaveTimer = setTimeout(() => postDomainDetails(domainId, item), 250);
}

function collectDomainDetailsPatch() {
  return {
    domainId: selectedDomainId,
    name: document.getElementById("domainName").value,
    description: document.getElementById("domainDescription").value
  };
}

function postDomainDetails(domainId, item) {
  clearTimeout(domainDetailsSaveTimer);
  domainDetailsSaveTimer = null;
  vscode.postMessage({
    type: "updateTaxonomy",
    request: {
      kind: "domain",
      action: "update",
      id: domainId,
      item
    }
  });
}

function applyDomainDetailsLocally(domainId, item) {
  const domain = (state.flow.domains || []).find((candidate) => candidate.domainId === domainId);
  if (!domain) {
    return;
  }
  domain.name = item.name.trim() || domain.name;
  domain.description = item.description.trim();
}

function refreshDomainViews() {
  const title = document.getElementById("domainPanelTitle");
  const titleInput = document.getElementById("domainName");
  const domain = (state.flow.domains || []).find((candidate) => candidate.domainId === selectedDomainId);
  if (title && domain && title.dataset.inlineEditing !== "true") {
    title.textContent = domain.name;
  }
  if (titleInput && domain) {
    titleInput.value = domain.name;
  }
  refreshTaxonomyPanels();
  refreshCanvasAndNodeList();
}

function commitRoleDetailsChange(options = {}) {
  if (!selectedRoleId) {
    return;
  }
  const roleId = selectedRoleId;
  const item = collectRoleDetailsPatch();
  applyRoleDetailsLocally(roleId, item);
  refreshRoleViews();
  if (options.localOnly) {
    clearTimeout(roleDetailsSaveTimer);
    roleDetailsSaveTimer = null;
    return;
  }
  if (options.immediate) {
    postRoleDetails(roleId, item);
    return;
  }
  clearTimeout(roleDetailsSaveTimer);
  roleDetailsSaveTimer = setTimeout(() => postRoleDetails(roleId, item), 250);
}

function collectRoleDetailsPatch() {
  return {
    roleId: selectedRoleId,
    name: document.getElementById("roleName").value,
    description: document.getElementById("roleDescription").value,
    domainIds: collectMultiSelect("roleDomainIds")
  };
}

function postRoleDetails(roleId, item) {
  clearTimeout(roleDetailsSaveTimer);
  roleDetailsSaveTimer = null;
  vscode.postMessage({
    type: "updateTaxonomy",
    request: {
      kind: "role",
      action: "update",
      id: roleId,
      item
    }
  });
}

function applyRoleDetailsLocally(roleId, item) {
  const role = (state.flow.roles || []).find((candidate) => candidate.roleId === roleId);
  if (!role) {
    return;
  }
  role.name = item.name.trim() || role.name;
  role.description = item.description.trim();
  role.domainIds = item.domainIds;
}

function refreshRoleViews() {
  const title = document.getElementById("rolePanelTitle");
  const titleInput = document.getElementById("roleName");
  const role = (state.flow.roles || []).find((candidate) => candidate.roleId === selectedRoleId);
  if (title && role && title.dataset.inlineEditing !== "true") {
    title.textContent = role.name;
  }
  if (titleInput && role) {
    titleInput.value = role.name;
  }
  refreshTaxonomyPanels();
  refreshCanvasAndNodeList();
}

function commitStatusGroupDetailsChange(options = {}) {
  if (!selectedStatusGroupId) {
    return;
  }
  const statusGroupId = selectedStatusGroupId;
  const item = collectStatusGroupDetailsPatch();
  applyStatusGroupDetailsLocally(statusGroupId, item);
  refreshStatusGroupViews();
  if (options.localOnly) {
    clearTimeout(statusGroupDetailsSaveTimer);
    statusGroupDetailsSaveTimer = null;
    return;
  }
  if (options.immediate) {
    postStatusGroupDetails(statusGroupId, item);
    return;
  }
  clearTimeout(statusGroupDetailsSaveTimer);
  statusGroupDetailsSaveTimer = setTimeout(() => postStatusGroupDetails(statusGroupId, item), 250);
}

function collectStatusGroupDetailsPatch() {
  return {
    statusGroupId: selectedStatusGroupId,
    title: document.getElementById("statusGroupTitle").value,
    description: document.getElementById("statusGroupDescription").value,
    color: normalizeStatusGroupColor(document.getElementById("statusGroupColor").value)
  };
}

function postStatusGroupDetails(statusGroupId, item) {
  clearTimeout(statusGroupDetailsSaveTimer);
  statusGroupDetailsSaveTimer = null;
  vscode.postMessage({
    type: "updateTaxonomy",
    request: {
      kind: "statusGroup",
      action: "update",
      id: statusGroupId,
      item
    }
  });
}

function applyStatusGroupDetailsLocally(statusGroupId, item) {
  const statusGroup = getStatusGroup(state.flow, statusGroupId);
  if (!statusGroup) {
    return;
  }
  statusGroup.title = item.title.trim() || statusGroup.title;
  statusGroup.description = item.description.trim();
  statusGroup.color = normalizeStatusGroupColor(item.color || statusGroup.color);
}

function refreshStatusGroupViews() {
  const title = document.getElementById("statusGroupPanelTitle");
  const titleInput = document.getElementById("statusGroupTitle");
  const colorInput = document.getElementById("statusGroupColor");
  const colorValue = document.querySelector(".status-group-color-value");
  const statusGroup = getStatusGroup(state.flow, selectedStatusGroupId);
  if (title && statusGroup && title.dataset.inlineEditing !== "true") {
    title.textContent = statusGroup.title;
  }
  if (titleInput && statusGroup) {
    titleInput.value = statusGroup.title;
  }
  if (colorInput && statusGroup) {
    const color = normalizeStatusGroupColor(statusGroup.color);
    colorInput.value = color;
    if (colorValue) {
      colorValue.textContent = color;
    }
  }
  refreshTaxonomyPanels();
  refreshCanvasAndNodeList();
}

function applyAppSurfaceDetailsLocally(appId, item) {
  const surface = (state.flow.appSurfaces || []).find((candidate) => candidate.appId === appId);
  if (!surface) {
    return;
  }
  surface.name = item.name.trim() || surface.name;
  surface.type = getAppSurfaceTypeOption(item.type).value || surface.type || "other";
  surface.description = item.description.trim();
  surface.domainIds = item.domainIds;
  surface.roleIds = item.roleIds;
}

function refreshAppSurfaceViews() {
  const title = document.getElementById("appSurfacePanelTitle");
  const titleInput = document.getElementById("appSurfaceName");
  const surface = (state.flow.appSurfaces || []).find((candidate) => candidate.appId === selectedAppSurfaceId);
  if (title && surface && title.dataset.inlineEditing !== "true") {
    title.textContent = surface.name;
  }
  if (titleInput && surface) {
    titleInput.value = surface.name;
  }
  refreshTaxonomyPanels();
  const world = document.getElementById("world");
  if (world) {
    seedProjectOverviewPosition(state.flow);
    seedAppSurfacePositions(state.flow);
    const activeNodes = state.flow.nodes.filter((node) => node.status !== "removed");
    world.innerHTML = `${renderProjectOverviewCard(state.flow)}${renderAppSurfaceSourceCards(state.flow)}${activeNodes.map((node) => renderNodeCard(state.flow, node)).join("")}`;
    applyStatusGroupColorSwatches(world);
    bindCanvasElements(world);
    positionCards();
    scheduleDrawEdges();
  }
}

function refreshTaxonomyPanels() {
  const panels = document.querySelector(".floating-taxonomy-panels");
  if (!panels) {
    return;
  }
  panels.innerHTML = `
    ${taxonomyPanelsOpen.appSurface === true ? renderManagedList("appSurface", "应用端", state.flow.appSurfaces || [], "appId", "name", "description", appFilters) : ""}
    ${taxonomyPanelsOpen.domain === true ? renderManagedList("domain", "业务域", getAvailableDomains(state.flow), "domainId", "name", "description", domainFilters) : ""}
    ${taxonomyPanelsOpen.role === true ? renderManagedList("role", "角色", getAvailableRoles(state.flow), "roleId", "name", "description", roleFilters) : ""}
    ${taxonomyPanelsOpen.statusGroup === true ? renderStatusGroupList(getStatusGroups(state.flow)) : ""}
  `;
  bindTaxonomyControls(panels);
  applyStatusGroupColorSwatches(panels);
}

function submitEdgeDetails(options = {}) {
  if (!selectedEdgeId) {
    return;
  }
  const edgeId = selectedEdgeId;
  const patch = collectEdgeDetailsPatch();
  const saveRevision = ++edgeDetailsSaveRevision;
  applyEdgeDetailsLocally(edgeId, patch);
  scheduleDrawEdges();
  if (options.localOnly) {
    clearTimeout(edgeDetailsSaveTimer);
    edgeDetailsSaveTimer = null;
    return;
  }
  if (options.immediate) {
    postEdgeDetails(edgeId, patch, saveRevision);
    return;
  }
  clearTimeout(edgeDetailsSaveTimer);
  edgeDetailsSaveTimer = setTimeout(() => {
    if (saveRevision === edgeDetailsSaveRevision) {
      postEdgeDetails(edgeId, patch, saveRevision);
    }
  }, 150);
}

function collectEdgeDetailsPatch() {
  return {
    trigger: document.getElementById("edgeTriggerRule").value,
    from: parseEndpointValue(document.getElementById("edgeFromEndpoint").dataset.endpointValue),
    to: parseEndpointValue(document.getElementById("edgeToEndpoint").dataset.endpointValue),
    type: document.getElementById("edgeType").dataset.edgeTypeValue || "interaction",
    condition: document.getElementById("edgeCondition").value,
    appSurfaceIds: collectTagMultiSelect("edgeAppSurfaceIds"),
    domainIds: collectTagMultiSelect("edgeDomainIds"),
    roleIds: collectTagMultiSelect("edgeRoleIds")
  };
}

function applyProjectOverviewDetailsLocally(patch) {
  const overview = getProjectOverview(state.flow);
  state.flow.title = patch.title.trim() || state.flow.title || "项目概述";
  overview.summary = patch.summary.trim() || overview.summary;
  overview.goal = patch.goal.trim();
  const title = document.getElementById("projectOverviewPanelTitle");
  const titleInput = document.getElementById("projectOverviewTitle");
  if (title && title.dataset.inlineEditing !== "true") {
    title.textContent = state.flow.title;
  }
  if (titleInput) {
    titleInput.value = state.flow.title;
  }
}

function refreshProjectOverviewViews() {
  const card = document.querySelector(".project-overview-card");
  if (card) {
    const replacement = document.createElement("div");
    replacement.innerHTML = renderProjectOverviewCard(state.flow);
    const nextCard = replacement.firstElementChild;
    if (nextCard) {
      card.replaceWith(nextCard);
      bindCanvasElements(nextCard);
      positionCards();
      scheduleDrawEdges();
    }
  }
}

function postEdgeDetails(edgeId, patch, revision) {
  persistCurrentInspectorScroll();
  clearTimeout(edgeDetailsSaveTimer);
  edgeDetailsSaveTimer = null;
  rememberPendingEdgeDetailsSave(edgeId, patch, revision);
  vscode.postMessage({
    type: "updateEdgeDetails",
    edgeId,
    revision,
    patch
  });
}

function applyNodeDetailsLocally(nodeId, patch) {
  const node = state.flow.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    return;
  }
  node.title = patch.title;
  node.pageType = patch.pageType;
  node.purpose = patch.purpose;
  if (patch.statusGroupId) {
    node.statusGroupId = patch.statusGroupId;
  } else {
    delete node.statusGroupId;
  }
  node.appSurfaceIds = patch.appSurfaceIds;
  node.domainIds = patch.domainIds;
  node.roleIds = patch.roleIds;
  node.featureGroups = patch.featureGroups;
  const title = document.getElementById("nodePanelTitle");
  const titleInput = document.getElementById("nodeTitle");
  if (title && title.dataset.inlineEditing !== "true") {
    title.textContent = node.title;
  }
  if (titleInput) {
    titleInput.value = node.title;
  }
}

function applyEdgeDetailsLocally(edgeId, patch) {
  const edge = state.flow.edges.find((item) => item.edgeId === edgeId);
  if (!edge) {
    return;
  }
  edge.from = patch.from;
  edge.to = patch.to;
  edge.fromNodeId = endpointEntityId(patch.from);
  edge.toNodeId = endpointEntityId(patch.to);
  edge.trigger = patch.trigger.trim();
  edge.action = edge.trigger;
  edge.type = patch.type;
  edge.condition = patch.condition.trim() || undefined;
  edge.appSurfaceIds = patch.appSurfaceIds;
  edge.domainIds = patch.domainIds;
  edge.roleIds = patch.roleIds;
  const title = document.getElementById("edgePanelTitle");
  const titleInput = document.getElementById("edgeTriggerRule");
  if (title && title.dataset.inlineEditing !== "true") {
    title.textContent = edge.trigger;
  }
  if (titleInput) {
    titleInput.value = edge.trigger;
  }
}

function rememberPendingEdgeDetailsSave(edgeId, patch, revision) {
  if (!isUsableEdgeDetailsPatch(patch)) {
    return;
  }
  pendingEdgeDetailsSaves = pendingEdgeDetailsSaves.filter((entry) => entry.edgeId !== edgeId);
  pendingEdgeDetailsSaves.push({
    edgeId,
    revision,
    savedAt: Date.now(),
    patch
  });
  persistUiState();
}

function reconcilePendingEdgeDetailsSaves() {
  const now = Date.now();
  pendingEdgeDetailsSaves = pendingEdgeDetailsSaves.filter((entry) => {
    const edge = state.flow.edges.find((item) => item.edgeId === entry.edgeId);
    if (!edge || now - entry.savedAt > PENDING_EDGE_DETAILS_TTL_MS) {
      return false;
    }
    if (edgeDetailsPatchMatches(edge, entry.patch)) {
      return false;
    }
    applyEdgeDetailsLocally(entry.edgeId, entry.patch);
    return true;
  });
}

function readPendingEdgeDetailsSaves(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const now = Date.now();
  return value.filter((entry) =>
    entry &&
    typeof entry.edgeId === "string" &&
    isUsableEdgeDetailsPatch(entry.patch) &&
    Number.isFinite(Number(entry.savedAt)) &&
    now - Number(entry.savedAt) <= PENDING_EDGE_DETAILS_TTL_MS
  ).map((entry) => ({
    edgeId: entry.edgeId,
    revision: Number(entry.revision) || 0,
    savedAt: Number(entry.savedAt),
    patch: entry.patch
  }));
}

function isUsableEdgeDetailsPatch(patch) {
  return Boolean(
    patch &&
    patch.from &&
    patch.to &&
    typeof patch.from.kind === "string" &&
    typeof patch.from.nodeId === "string" &&
    typeof patch.to.kind === "string" &&
    typeof patch.to.nodeId === "string" &&
    typeof patch.trigger === "string" &&
    typeof patch.type === "string" &&
    typeof patch.condition === "string"
  );
}

function edgeDetailsPatchMatches(edge, patch) {
  const from = edge.from || { kind: "node", nodeId: edge.fromNodeId };
  const to = edge.to || { kind: "node", nodeId: edge.toNodeId };
  return endpointKey(from) === endpointKey(patch.from) &&
    endpointKey(to) === endpointKey(patch.to) &&
    String(edge.trigger || edge.action || "") === String(patch.trigger || "").trim() &&
    normalizeEdgeTypeForSelect(edge.type) === normalizeEdgeTypeForSelect(patch.type) &&
    String(edge.condition || "") === String(patch.condition || "").trim() &&
    sameStringSet(edge.appSurfaceIds || [], patch.appSurfaceIds || []) &&
    sameStringSet(edge.domainIds || [], patch.domainIds || []) &&
    sameStringSet(edge.roleIds || [], patch.roleIds || []);
}

function sameStringSet(left, right) {
  const leftValues = [...new Set((left || []).filter(Boolean))].sort();
  const rightValues = [...new Set((right || []).filter(Boolean))].sort();
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}
