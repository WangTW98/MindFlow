let appFilters = readIdSelection(persisted.appFilters, persisted.appFilter);
let domainFilters = readIdSelection(persisted.domainFilters, persisted.domainFilter);
let roleFilters = readIdSelection(persisted.roleFilters, persisted.roleFilter);
let taxonomySelection = readTaxonomySelection(persisted.taxonomySelection);
selectedAppSurfaceId ||= taxonomySelection.appSurface;
selectedDomainId ||= taxonomySelection.domain;
selectedRoleId ||= taxonomySelection.role;
selectedStatusGroupId ||= taxonomySelection.statusGroup;
if (selectedNodeId || selectedEdgeId || selectedAppSurfaceId || selectedDomainId || selectedRoleId || selectedStatusGroupId) {
  selectedProjectOverview = false;
}
let taxonomyPanelsOpen = readTaxonomyPanelsOpen();
let nodeSearch = persisted.nodeSearch || "";
let nodeSearchComposing = false;
let leftPanelCollapsed = Boolean(persisted.leftPanelCollapsed);
let zoom = clamp(Number(persisted.zoom || 1), MIN_ZOOM, MAX_ZOOM);
let camera = persisted.camera && Number.isFinite(persisted.camera.x) && Number.isFinite(persisted.camera.y)
  ? { x: persisted.camera.x, y: persisted.camera.y }
  : { x: 800, y: 120 };
