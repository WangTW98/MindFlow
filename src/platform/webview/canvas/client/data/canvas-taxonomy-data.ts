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
  const fromEndpoint = edge.from;
  const toEndpoint = edge.to;
  const endpointAppIds = [...endpointAppSurfaceIds(fromEndpoint), ...endpointAppSurfaceIds(toEndpoint)];
  const endpointDomainIds = [...endpointDomainSelectionIds(fromEndpoint), ...endpointDomainSelectionIds(toEndpoint)];
  const endpointRoleIds = [...endpointRoleSelectionIds(fromEndpoint), ...endpointRoleSelectionIds(toEndpoint)];
  const appOk = appFilters.length === 0 || intersects(edge.appSurfaceIds || [], appFilters) || intersects(endpointAppIds, appFilters);
  const domainOk = domainFilters.length === 0 || intersects(edge.domainIds || [], domainFilters) || intersects(endpointDomainIds, domainFilters);
  const roleOk = roleFilters.length === 0 || intersects(edge.roleIds || [], roleFilters) || intersects(endpointRoleIds, roleFilters);
  return appOk && domainOk && roleOk;
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
