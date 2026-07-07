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
    title: requireInputValue("projectOverviewTitle"),
    summary: requireInputValue("projectOverviewSummary"),
    goal: requireInputValue("projectOverviewGoal")
  };
}

function postProjectOverviewDetails(patch) {
  persistCurrentInspectorScroll();
  clearTimeout(projectOverviewDetailsSaveTimer);
  projectOverviewDetailsSaveTimer = null;
  postWebviewMessage({
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
    title: requireInputValue("nodeTitle"),
    pageType: requireInputValue("nodePageType"),
    purpose: requireInputValue("nodePurpose"),
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
  postWebviewMessage({
    type: "updateNodeDetails",
    nodeId,
    patch
  });
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
  refreshNodeSidebarHeader(state.flow);
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
