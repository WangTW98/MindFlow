let appFilters = readIdSelection(persisted.appFilters);
let domainFilters = readIdSelection(persisted.domainFilters);
let roleFilters = readIdSelection(persisted.roleFilters);
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
let viewportInitializedFor = typeof persisted.viewportInitializedFor === "string" ? persisted.viewportInitializedFor : "";
let zoom = clamp(Number(persisted.zoom || 1), MIN_ZOOM, MAX_ZOOM);
let camera = persisted.camera && Number.isFinite(persisted.camera.x) && Number.isFinite(persisted.camera.y)
  ? { x: persisted.camera.x, y: persisted.camera.y }
  : { x: 800, y: 120 };
