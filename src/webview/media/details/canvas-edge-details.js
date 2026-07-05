function submitEdgeDetails(options = {}) {
  if (!selectedEdgeId) {
    return;
  }
  const edgeId = selectedEdgeId;
  const patch = collectEdgeDetailsPatch();
  const saveRevision = ++edgeDetailsSaveRevision;
  applyEdgeDetailsLocally(edgeId, patch);
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
  const fallbackFrom = edge?.from || (edge?.fromNodeId ? { kind: "node", nodeId: edge.fromNodeId } : undefined);
  const fallbackTo = edge?.to || (edge?.toNodeId ? { kind: "node", nodeId: edge.toNodeId } : undefined);
  return {
    trigger: document.getElementById("edgeTriggerRule").value,
    from: parseEndpointValue(document.getElementById("edgeFromEndpoint").dataset.endpointValue, fallbackFrom),
    to: parseEndpointValue(document.getElementById("edgeToEndpoint").dataset.endpointValue, fallbackTo),
    type: document.getElementById("edgeType").dataset.edgeTypeValue || "interaction",
    condition: document.getElementById("edgeCondition").value,
    appSurfaceIds: collectTagMultiSelect("edgeAppSurfaceIds"),
    domainIds: collectTagMultiSelect("edgeDomainIds"),
    roleIds: collectTagMultiSelect("edgeRoleIds")
  };
}

function postEdgeDetails(edgeId, patch, revision) {
  persistCurrentInspectorScroll();
  clearTimeout(edgeDetailsSaveTimer);
  edgeDetailsSaveTimer = null;
  rememberPendingEdgeDetailsSave(edgeId, patch, revision);
  vscode.postMessage({
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
  edge.appSurfaceIds = patch.appSurfaceIds;
  edge.domainIds = patch.domainIds;
  edge.roleIds = patch.roleIds;
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

function readPendingEdgeDetailsSaves(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const now = Date.now();
  return value.filter((entry) =>
    entry &&
    typeof entry.edgeId === "string" &&
    isUsableEdgeDetailsPatch(entry.patch) &&
    Number.isFinite(Number(entry.savedAt)) &&
    now - Number(entry.savedAt) <= PENDING_EDGE_DETAILS_TTL_MS
  ).map((entry) => ({
    edgeId: entry.edgeId,
    revision: Number(entry.revision) || 0,
    savedAt: Number(entry.savedAt),
    patch: entry.patch
  }));
}

function isUsableEdgeDetailsPatch(patch) {
  return Boolean(
    patch &&
    patch.from &&
    patch.to &&
    typeof patch.from.kind === "string" &&
    typeof patch.from.nodeId === "string" &&
    typeof patch.to.kind === "string" &&
    typeof patch.to.nodeId === "string" &&
    typeof patch.trigger === "string" &&
    typeof patch.type === "string" &&
    typeof patch.condition === "string"
  );
}

function edgeDetailsPatchMatches(edge, patch) {
  const from = edge.from || { kind: "node", nodeId: edge.fromNodeId };
  const to = edge.to || { kind: "node", nodeId: edge.toNodeId };
  return endpointKey(from) === endpointKey(patch.from) &&
    endpointKey(to) === endpointKey(patch.to) &&
    String(edge.trigger || edge.action || "") === String(patch.trigger || "").trim() &&
    normalizeEdgeTypeForSelect(edge.type) === normalizeEdgeTypeForSelect(patch.type) &&
    String(edge.condition || "") === String(patch.condition || "").trim() &&
    sameStringSet(edge.appSurfaceIds || [], patch.appSurfaceIds || []) &&
    sameStringSet(edge.domainIds || [], patch.domainIds || []) &&
    sameStringSet(edge.roleIds || [], patch.roleIds || []);
}

function sameStringSet(left, right) {
  const leftValues = [...new Set((left || []).filter(Boolean))].sort();
  const rightValues = [...new Set((right || []).filter(Boolean))].sort();
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}
