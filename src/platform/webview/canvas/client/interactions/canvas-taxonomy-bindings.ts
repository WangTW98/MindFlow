function bindTaxonomyPanelToggles(root = document) {
  root.querySelectorAll("[data-taxonomy-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const kind = button.dataset.taxonomyToggle;
      if (!kind) {
        return;
      }
      taxonomyPanelsOpen = {
        ...taxonomyPanelsOpen,
        [kind]: taxonomyPanelsOpen[kind] !== true
      };
      persistUiState();
      render();
      requestAnimationFrame(() => focusCanvas());
    });
  });
}

function closeAllTaxonomyPanels() {
  if (!taxonomyPanelsOpen.appSurface && !taxonomyPanelsOpen.domain && !taxonomyPanelsOpen.role && !taxonomyPanelsOpen.statusGroup) {
    return false;
  }
  taxonomyPanelsOpen = {
    appSurface: false,
    domain: false,
    role: false,
    statusGroup: false
  };
  persistUiState();
  return true;
}

function bindTaxonomyControls(root: any = document) {
  root.querySelectorAll(".taxonomy-filter-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      setFilterSelection(checkbox.dataset.kind, checkbox.value, checkbox.checked);
      render();
    });
    checkbox.addEventListener("click", (event) => event.stopPropagation());
  });

  root.querySelectorAll(".managed-list-item").forEach((item) => {
    item.addEventListener("pointerdown", (event) => event.stopPropagation());
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      selectTaxonomyItem(item.dataset.kind, item.dataset.taxonomyId);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        selectTaxonomyItem(item.dataset.kind, item.dataset.taxonomyId);
      }
    });
  });

  root.querySelectorAll(".taxonomy-action").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      manageTaxonomy(button.dataset.kind, button.dataset.action, button.dataset.taxonomyId);
    });
  });
}

function setFilterSelection(kind, id, checked) {
  const list = getFilterSelection(kind);
  if (checked && !list.includes(id)) {
    list.push(id);
  } else if (!checked) {
    const index = list.indexOf(id);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }
  normalizeFilters();
}

function getFilterSelection(kind) {
  if (kind === "appSurface") {
    return appFilters;
  }
  if (kind === "domain") {
    return domainFilters;
  }
  if (kind === "statusGroup") {
    return [];
  }
  return roleFilters;
}

function selectTaxonomyItem(kind, id) {
  if (!kind || !id) {
    return;
  }
  selectedProjectOverview = false;
  if (kind === "statusGroup") {
    selectStatusGroup(id);
    return;
  }
  if (kind === "appSurface") {
    selectAppSurface(id);
    return;
  }
  clearNodeSelectionState();
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedStatusGroupId = "";
  if (kind === "domain") {
    selectedDomainId = id;
    selectedRoleId = "";
    taxonomySelection = {
      appSurface: "",
      domain: id,
      role: "",
      statusGroup: ""
    };
    postWebviewMessage({ type: "selectDomain", domainId: id });
  } else {
    selectedDomainId = "";
    selectedRoleId = id;
    taxonomySelection = {
      appSurface: "",
      domain: "",
      role: id,
      statusGroup: ""
    };
    postWebviewMessage({ type: "selectRole", roleId: id });
  }
  persistUiState();
  render();
  requestAnimationFrame(() => focusCanvas());
}

function manageTaxonomy(kind, action, targetId = "") {
  if (!kind || !action) {
    return;
  }
  const flow = state.flow;
  const currentId = action === "create" ? "" : targetId || getSelectedTaxonomyId(kind) || taxonomySelection[kind] || "";
  const current = getTaxonomyItems(flow, kind).find((item) => getTaxonomyId(kind, item) === currentId);
  if (action === "create") {
    const item = createDefaultTaxonomyItem(flow, kind);
    const id = getTaxonomyId(kind, item);
    addTaxonomyItemLocally(flow, kind, item);
    selectTaxonomyItem(kind, id);
    postWebviewMessage({ type: "updateTaxonomy", request: { kind, action, id, item } });
    return;
  }
  if (!current) {
    return;
  }
  if (action === "delete") {
    clearTaxonomySelection(kind, currentId);
    removeTaxonomyItemLocally(flow, kind, currentId);
    postWebviewMessage({ type: "updateTaxonomy", request: { kind, action, id: currentId } });
    render();
    return;
  }
}

function createDefaultTaxonomyItem(flow, kind) {
  const index = getTaxonomyItems(flow, kind).length + 1;
  if (kind === "appSurface") {
    return {
      appId: makeClientId("app"),
      name: `新应用端 ${index}`,
      type: "other",
      description: "",
      domainIds: [],
      roleIds: []
    };
  }
  if (kind === "domain") {
    return {
      domainId: makeClientId("domain"),
      name: `新业务域 ${index}`,
      description: ""
    };
  }
  if (kind === "statusGroup") {
    return {
      statusGroupId: makeClientId("status"),
      title: `新状态组 ${index}`,
      description: "",
      color: randomStatusGroupColor(getStatusGroups(flow))
    };
  }
  return {
    roleId: makeClientId("role"),
    name: `新角色 ${index}`,
    description: "",
    domainIds: []
  };
}

function addTaxonomyItemLocally(flow, kind, item) {
  if (kind === "appSurface") {
    flow.appSurfaces = flow.appSurfaces || [];
    flow.appSurfaces.push(item);
    seedAppSurfacePositions(flow);
  } else if (kind === "domain") {
    flow.domains = flow.domains || [];
    flow.domains.push(item);
  } else if (kind === "role") {
    flow.roles = flow.roles || [];
    flow.roles.push(item);
  } else if (kind === "statusGroup") {
    flow.statusGroups = flow.statusGroups || [];
    flow.statusGroups.push(item);
  }
}

function removeTaxonomyItemLocally(flow, kind, id) {
  if (kind === "appSurface") {
    flow.appSurfaces = (flow.appSurfaces || []).filter((item) => item.appId !== id);
    flow.nodes.forEach((node) => {
      node.appSurfaceIds = (node.appSurfaceIds || []).filter((appId) => appId !== id);
    });
    flow.edges = flow.edges.filter((edge) => {
      if (edgeReferencesAppSurfaceEndpoint(edge, id)) {
        return false;
      }
      edge.appSurfaceIds = (edge.appSurfaceIds || []).filter((appId) => appId !== id);
      return true;
    });
    appSurfacePositions.delete(id);
  } else if (kind === "domain") {
    flow.domains = (flow.domains || []).filter((item) => item.domainId !== id);
  } else if (kind === "role") {
    flow.roles = (flow.roles || []).filter((item) => item.roleId !== id);
  } else if (kind === "statusGroup") {
    flow.statusGroups = (flow.statusGroups || []).filter((item) => item.statusGroupId !== id);
    flow.nodes.forEach((node) => {
      if (node.statusGroupId === id) {
        delete node.statusGroupId;
      }
    });
  }
}

function edgeReferencesAppSurfaceEndpoint(edge, appId) {
  return endpointReferencesAppSurface(edge.from, appId) ||
    endpointReferencesAppSurface(edge.to, appId);
}

function endpointReferencesAppSurface(endpoint, appId) {
  return Boolean(endpoint && endpoint.kind === "appSurface" && endpointEntityId(endpoint) === appId);
}

function clearTaxonomySelection(kind, id) {
  taxonomySelection = {
    ...taxonomySelection,
    [kind]: ""
  };
  const list = getFilterSelection(kind);
  const index = list.indexOf(id);
  if (index >= 0) {
    list.splice(index, 1);
  }
  if (kind === "appSurface" && selectedAppSurfaceId === id) {
    selectedAppSurfaceId = "";
  }
  if (kind === "domain" && selectedDomainId === id) {
    selectedDomainId = "";
  }
  if (kind === "role" && selectedRoleId === id) {
    selectedRoleId = "";
  }
  if (kind === "statusGroup" && selectedStatusGroupId === id) {
    selectedStatusGroupId = "";
  }
  persistUiState();
}
