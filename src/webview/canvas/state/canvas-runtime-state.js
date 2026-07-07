let selectedNodeIds = readIdSelection(persisted.selectedNodeIds || state.selectedNodeIds, state.selectedNodeId || persisted.selectedNodeId);
let selectedNodeId = selectedNodeIds.includes(persisted.selectedNodeId)
  ? persisted.selectedNodeId
  : selectedNodeIds.includes(state.selectedNodeId)
    ? state.selectedNodeId
    : selectedNodeIds[0] || state.selectedNodeId || persisted.selectedNodeId || "";
if (selectedNodeIds.length === 0 && selectedNodeId) {
  selectedNodeIds = [selectedNodeId];
} else if (selectedNodeId && !selectedNodeIds.includes(selectedNodeId)) {
  selectedNodeId = selectedNodeIds[0] || "";
}
let selectedProjectOverview = Boolean(state.selectedProjectOverview || persisted.selectedProjectOverview);
let selectedEdgeId = state.selectedEdgeId || "";
let selectedAppSurfaceId = state.selectedAppSurfaceId || persisted.selectedAppSurfaceId || "";
let selectedDomainId = state.selectedDomainId || persisted.selectedDomainId || "";
let selectedRoleId = state.selectedRoleId || persisted.selectedRoleId || "";
let selectedStatusGroupId = state.selectedStatusGroupId || persisted.selectedStatusGroupId || "";
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
let connectingFrom = persisted.connectingFrom || null;
let connectionDrag = null;
let connectionDropTarget = null;
let dragState = null;
let panState = null;
let suppressNextCanvasClick = false;
let suppressNextNodeCardClick = false;
let featureDrag = null;
let projectOverviewDetailsSaveTimer = null;
let nodeDetailsSaveTimer = null;
let appSurfaceDetailsSaveTimer = null;
let domainDetailsSaveTimer = null;
let roleDetailsSaveTimer = null;
let statusGroupDetailsSaveTimer = null;
let edgeDetailsSaveTimer = null;
let edgeDetailsSaveRevision = 0;
let pendingEdgeDetailsSaves = readPendingEdgeDetailsSaves(persisted.pendingEdgeDetailsSaves);
let inspectorScrollState = readInspectorScrollState(persisted.inspectorScrollState);
let autoLayoutPreviewState = autoLayoutNormalizePersistedPreviewState(persisted.autoLayoutPreviewState);
let framePending = false;
const nodePositions = new Map();
const appSurfacePositions = new Map();
let projectOverviewPosition = null;
let commandStatus = readCommandStatus(persisted.commandStatus);
let commandStatusTimer = null;
