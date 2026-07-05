function collectMultiSelect(id) {
  const select = document.getElementById(id);
  return Array.from(select?.selectedOptions || []).map((option) => option.value);
}

function collectTagMultiSelect(id) {
  return Array.from(document.querySelectorAll(`#${cssEscape(id)} input[type="checkbox"]:checked`))
    .map((input) => input.value);
}

function readIdSelection(value, legacyValue) {
  if (Array.isArray(value)) {
    return uniqueStringIds(value);
  }
  return typeof legacyValue === "string" && legacyValue.trim() ? [legacyValue.trim()] : [];
}

function uniqueStringIds(value) {
  return Array.from(new Set((value || []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())));
}

function readTaxonomySelection(value) {
  return {
    appSurface: typeof value?.appSurface === "string" ? value.appSurface : "",
    domain: typeof value?.domain === "string" ? value.domain : "",
    role: typeof value?.role === "string" ? value.role : "",
    statusGroup: typeof value?.statusGroup === "string" ? value.statusGroup : ""
  };
}

function readTaxonomyPanelsOpen() {
  const value = persisted.taxonomyPanelsOpen || {};
  return {
    appSurface: value.appSurface === true,
    domain: value.domain === true,
    role: value.role === true,
    statusGroup: value.statusGroup === true
  };
}

function readInspectorScrollState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((result, [key, scrollTop]) => {
    const normalized = Number(scrollTop);
    if (typeof key === "string" && key && Number.isFinite(normalized) && normalized >= 0) {
      result[key] = Math.round(normalized);
    }
    return result;
  }, {});
}

function inspectorScrollKey(kind, id) {
  return `${kind}:${id || ""}`;
}

function currentInspectorScrollKey() {
  const form = document.querySelector(".inspector .details-form[data-inspector-key]");
  return typeof form?.dataset.inspectorKey === "string" ? form.dataset.inspectorKey : "";
}

function persistCurrentInspectorScroll() {
  const inspector = document.querySelector(".inspector");
  const key = currentInspectorScrollKey();
  if (!inspector || !key) {
    return;
  }
  const scrollTop = Math.max(0, Math.round(inspector.scrollTop));
  if (inspectorScrollState[key] === scrollTop) {
    return;
  }
  inspectorScrollState = {
    ...inspectorScrollState,
    [key]: scrollTop
  };
  persistUiState();
}

function restoreInspectorScroll() {
  const inspector = document.querySelector(".inspector");
  const key = currentInspectorScrollKey();
  const scrollTop = Number(inspectorScrollState[key]);
  if (!inspector || !key || !Number.isFinite(scrollTop)) {
    return;
  }
  const restore = () => {
    inspector.scrollTop = scrollTop;
  };
  restore();
  requestAnimationFrame(restore);
}

function makeClientId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function handleHostMessage(message) {
  if (!message || message.type !== "commandResult") {
    return;
  }
  const replacementFlow = message.flow && typeof message.flow === "object" ? message.flow : null;
  if (replacementFlow) {
    state.flow = replacementFlow;
    resetLayoutCaches();
  }
  setCommandStatus(message.ok === true, typeof message.message === "string" ? message.message : "");
  if (replacementFlow) {
    render();
  } else {
    updateCommandStatusElement();
  }
}

function setCommandStatus(ok, message) {
  clearTimeout(commandStatusTimer);
  const statusMessage = String(message || "").trim();
  if (ok && !statusMessage) {
    commandStatus = null;
    persistUiState();
    return;
  }
  commandStatus = {
    kind: ok ? "ok" : "error",
    message: statusMessage || "操作失败，文档未更新。",
    at: Date.now()
  };
  persistUiState();
  if (ok) {
    commandStatusTimer = setTimeout(() => {
      commandStatus = null;
      persistUiState();
      updateCommandStatusElement();
    }, 2600);
  }
}

function updateCommandStatusElement() {
  const existing = document.getElementById("commandStatus");
  if (!commandStatus) {
    existing?.remove();
    return;
  }
  const canvas = document.getElementById("canvas");
  if (!canvas) {
    return;
  }
  const container = existing || document.createElement("div");
  container.id = "commandStatus";
  container.className = `command-status ${commandStatus.kind}`;
  container.setAttribute("role", "status");
  container.textContent = commandStatus.message;
  if (!existing) {
    canvas.appendChild(container);
  }
}

function resetLayoutCaches() {
  nodePositions.clear();
  appSurfacePositions.clear();
  projectOverviewPosition = null;
}

function readCommandStatus(value) {
  if (!value || (value.kind !== "ok" && value.kind !== "error") || typeof value.message !== "string") {
    return null;
  }
  const at = Number(value.at);
  if (!Number.isFinite(at)) {
    return null;
  }
  if (value.kind === "ok" && Date.now() - at > 3000) {
    return null;
  }
  return {
    kind: value.kind,
    message: value.message,
    at
  };
}

function persistUiState() {
  vscode.setState({
    appFilters,
    domainFilters,
    roleFilters,
    taxonomyPanelsOpen,
    taxonomySelection,
    selectedProjectOverview,
    selectedNodeId,
    selectedNodeIds,
    selectedAppSurfaceId,
    selectedDomainId,
    selectedRoleId,
    selectedStatusGroupId,
    nodeSearch,
    leftPanelCollapsed,
    zoom,
    camera,
    connectingFrom,
    pendingEdgeDetailsSaves,
    inspectorScrollState,
    commandStatus
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
