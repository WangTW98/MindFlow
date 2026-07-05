function bindEvents() {
  const canvas = document.getElementById("canvas");
  const edgeLayer = document.getElementById("edgeLayer");
  const nodeSearchInput = document.getElementById("nodeSearch");
  const closeInspectorButton = document.getElementById("closeInspector");

  bindAction("collapseLeftPanel", () => {
    leftPanelCollapsed = true;
    render();
  });
  bindAction("expandLeftPanel", () => {
    leftPanelCollapsed = false;
    render();
  });
  if (nodeSearchInput) {
    nodeSearchInput.addEventListener("compositionstart", () => {
      nodeSearchComposing = true;
    });
    nodeSearchInput.addEventListener("compositionend", (event) => {
      nodeSearchComposing = false;
      nodeSearch = event.target.value;
      persistUiState();
      renderAfterNodeSearchInput();
    });
    nodeSearchInput.addEventListener("input", (event) => {
      nodeSearch = event.target.value;
      persistUiState();
      if (nodeSearchComposing || event.isComposing) {
        return;
      }
      renderAfterNodeSearchInput();
    });
    nodeSearchInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
  }
  if (closeInspectorButton) {
    closeInspectorButton.addEventListener("click", clearSelection);
  }
  const inspector = document.querySelector(".inspector");
  if (inspector) {
    inspector.addEventListener("scroll", persistCurrentInspectorScroll, { passive: true });
  }

  bindTaxonomyPanelToggles(document);
  bindTaxonomyControls(document);
  applyEdgeTypeColorSwatches(document);
  applyStatusGroupColorSwatches(document);

  bindCanvasElements();

  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("pointerdown", startPan);
  canvas.addEventListener("pointermove", movePan);
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener("click", handleCanvasClick);
  document.oncontextmenu = handleContextMenu;
  document.onkeydown = handleKeyDown;

  edgeLayer.addEventListener("click", (event) => {
    const endpoint = event.target.closest(".edge-endpoint");
    if (endpoint) {
      event.stopPropagation();
      const edgeId = endpoint.dataset.edgeId;
      if (edgeId) {
        selectEdge(edgeId);
      }
      return;
    }
    const edgeTarget = event.target.closest("[data-edge-id]");
    if (edgeTarget) {
      event.stopPropagation();
      const edgeId = edgeTarget.dataset.edgeId;
      if (edgeId) {
        selectEdge(edgeId);
      }
    }
  });

  const nodeForm = document.getElementById("nodeDetailsForm");
  if (nodeForm) {
    bindNodeInspector(nodeForm);
  }
  const projectOverviewForm = document.getElementById("projectOverviewDetailsForm");
  if (projectOverviewForm) {
    bindProjectOverviewInspector(projectOverviewForm);
  }
  const appSurfaceForm = document.getElementById("appSurfaceDetailsForm");
  if (appSurfaceForm) {
    bindAppSurfaceInspector(appSurfaceForm);
  }
  const domainForm = document.getElementById("domainDetailsForm");
  if (domainForm) {
    bindDomainInspector(domainForm);
  }
  const roleForm = document.getElementById("roleDetailsForm");
  if (roleForm) {
    bindRoleInspector(roleForm);
  }
  const statusGroupForm = document.getElementById("statusGroupDetailsForm");
  if (statusGroupForm) {
    bindStatusGroupInspector(statusGroupForm);
  }
  const edgeForm = document.getElementById("edgeDetailsForm");
  if (edgeForm) {
    bindEdgeInspector(edgeForm);
  }
}

function bindAction(id, handler) {
  const button = document.getElementById(id);
  if (!button) {
    return;
  }
  button.addEventListener("click", handler);
}

function renderAfterNodeSearchInput() {
  render();
  requestAnimationFrame(() => {
    const nextInput = document.getElementById("nodeSearch");
    if (nextInput) {
      nextInput.focus({ preventScroll: true });
      nextInput.setSelectionRange(nodeSearch.length, nodeSearch.length);
    }
  });
}
