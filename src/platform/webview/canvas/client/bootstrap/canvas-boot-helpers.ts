// @ts-nocheck
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
