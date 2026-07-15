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
    name: requireInputValue("appSurfaceName"),
    type: requireInputValue("appSurfaceType"),
    description: requireInputValue("appSurfaceDescription"),
    domainIds: collectTagMultiSelect("appSurfaceDomainIds"),
    roleIds: collectTagMultiSelect("appSurfaceRoleIds")
  };
}

function postAppSurfaceDetails(appId, item) {
  clearTimeout(appSurfaceDetailsSaveTimer);
  appSurfaceDetailsSaveTimer = null;
  postWebviewMessage({
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
    name: requireInputValue("domainName"),
    description: requireInputValue("domainDescription")
  };
}

function postDomainDetails(domainId, item) {
  clearTimeout(domainDetailsSaveTimer);
  domainDetailsSaveTimer = null;
  postWebviewMessage({
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
    name: requireInputValue("roleName"),
    description: requireInputValue("roleDescription"),
    domainIds: collectMultiSelect("roleDomainIds")
  };
}

function postRoleDetails(roleId, item) {
  clearTimeout(roleDetailsSaveTimer);
  roleDetailsSaveTimer = null;
  postWebviewMessage({
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
    title: requireInputValue("statusGroupTitle"),
    description: requireInputValue("statusGroupDescription"),
    color: normalizeStatusGroupColor(requireInputValue("statusGroupColor"))
  };
}

function postStatusGroupDetails(statusGroupId, item) {
  clearTimeout(statusGroupDetailsSaveTimer);
  statusGroupDetailsSaveTimer = null;
  postWebviewMessage({
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
    refreshSelectionRelationsPanel();
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
