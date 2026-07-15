function submitEdgeDetails(options = {}) {
  if (!selectedEdgeId) {
    return;
  }
  const edgeId = selectedEdgeId;
  const patch = collectEdgeDetailsPatch();
  const saveRevision = ++edgeDetailsSaveRevision;
  applyEdgeDetailsLocally(edgeId, patch);
  refreshSelectionRelationsPanel();
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
  const edge = state.flow.edges.find((item) => item.edgeId === selectedEdgeId);
  const fallbackFrom = edge?.from;
  const fallbackTo = edge?.to;
  const fromInput = requireElementById("edgeFromEndpoint");
  const toInput = requireElementById("edgeToEndpoint");
  const edgeTypeInput = requireElementById("edgeType");
  return {
    trigger: requireInputValue("edgeTriggerRule"),
    from: parseEndpointValue(fromInput.dataset.endpointValue, fallbackFrom),
    to: parseEndpointValue(toInput.dataset.endpointValue, fallbackTo),
    type: edgeTypeInput.dataset.edgeTypeValue || "interaction",
    condition: requireInputValue("edgeCondition")
  };
}

function postEdgeDetails(edgeId, patch, revision) {
  persistCurrentInspectorScroll();
  clearTimeout(edgeDetailsSaveTimer);
  edgeDetailsSaveTimer = null;
  rememberPendingEdgeDetailsSave(edgeId, patch, revision);
  postWebviewMessage({
    type: "updateEdgeDetails",
    edgeId,
    revision,
    patch
  });
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

function edgeDetailsPatchMatches(edge, patch) {
  const from = edge.from;
  const to = edge.to;
  return endpointKey(from) === endpointKey(patch.from) &&
    endpointKey(to) === endpointKey(patch.to) &&
    String(edge.trigger || edge.action || "") === String(patch.trigger || "").trim() &&
    normalizeEdgeTypeForSelect(edge.type) === normalizeEdgeTypeForSelect(patch.type) &&
    String(edge.condition || "") === String(patch.condition || "").trim();
}
