function bindCanvasElements(root: any = document) {
  const projectOverviewCards = root.matches?.(".project-overview-card")
    ? [root]
    : Array.from(root.querySelectorAll(".project-overview-card"));
  projectOverviewCards.forEach((card) => {
    card.addEventListener("pointerdown", startProjectOverviewDrag);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, textarea, select")) {
        return;
      }
      if (!dragState) {
        selectProjectOverview();
      }
    });
  });

  root.querySelectorAll(".node-list-item").forEach((button) => {
    button.addEventListener("click", (event) => {
      const nodeId = button.dataset.listNodeId;
      if (nodeId) {
        const multi = isNodeMultiSelectEvent(event);
        if (multi) {
          event.preventDefault();
        }
        selectNode(nodeId, true, { multi });
      }
    });
  });

  root.querySelectorAll(".node-card").forEach((card) => {
    card.addEventListener("pointerdown", startNodeDrag);
    card.addEventListener("click", (event) => {
      if (suppressNextNodeCardClick) {
        suppressNextNodeCardClick = false;
        suppressNextCanvasClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target.closest("button, input, textarea, select")) {
        return;
      }
      const nodeId = card.dataset.nodeId;
      if (nodeId && !dragState) {
        const multi = isNodeMultiSelectEvent(event);
        if (multi) {
          event.preventDefault();
        }
        selectNode(nodeId, false, { multi });
      }
    });
  });

  root.querySelectorAll(".app-surface-card").forEach((card) => {
    card.addEventListener("pointerdown", startAppSurfaceDrag);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, textarea, select")) {
        return;
      }
      const appId = card.dataset.appSurfaceId;
      if (appId && !dragState) {
        selectAppSurface(appId);
      }
    });
  });

  root.querySelectorAll(".origin-dot").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      const endpoint = endpointFromButton(button);
      if (endpoint) {
        startConnectionDrag(event, "from", endpoint, button);
      }
    });
  });

  root.querySelectorAll(".target-dot").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      const endpoint = endpointFromTargetButton(button);
      if (endpoint) {
        startConnectionDrag(event, "to", endpoint, button);
      }
    });
  });
}
