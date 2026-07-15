function autoLayoutCreatePreviewState(flow, layout) {
  return {
    signature: autoLayoutFlowSignature(flow),
    entitySignature: autoLayoutEntitySignature(flow),
    projectOverviewPosition: autoLayoutCopyPosition(layout.projectOverviewPosition),
    appSurfacePositions: autoLayoutCopyPositionRecord(layout.appSurfacePositions),
    nodePositions: autoLayoutCopyPositionRecord(layout.nodePositions)
  };
}

function autoLayoutPreviewPositionsForFlow(flow, previewState) {
  const normalized = autoLayoutNormalizePersistedPreviewState(previewState);
  if (!normalized) {
    return null;
  }
  if (autoLayoutPreviewStateMatchesFlow(normalized, flow)) {
    return autoLayoutPreviewStateWithFlowPositions(flow, normalized);
  }
  if (!autoLayoutPreviewStateCanExtendToFlow(normalized, flow)) {
    return null;
  }
  return autoLayoutPreviewStateWithFlowPositions(flow, normalized);
}

function autoLayoutPreviewStateWithFlowPositions(flow, previewState) {
  const activeNodeIds = (Array.isArray(flow?.nodes) ? flow.nodes : [])
    .filter((node) => node.status !== "removed")
    .map((node) => node.nodeId)
    .filter((nodeId) => typeof nodeId === "string" && nodeId);
  const activeNodesById = new Map((Array.isArray(flow?.nodes) ? flow.nodes : [])
    .filter((node) => node.status !== "removed" && typeof node.nodeId === "string" && node.nodeId)
    .map((node) => [node.nodeId, node]));
  const appIds = (Array.isArray(flow?.appSurfaces) ? flow.appSurfaces : [])
    .map((surface) => surface.appId)
    .filter((appId) => typeof appId === "string" && appId);
  const appSurfacesById = new Map((Array.isArray(flow?.appSurfaces) ? flow.appSurfaces : [])
    .filter((surface) => typeof surface.appId === "string" && surface.appId)
    .map((surface) => [surface.appId, surface]));
  const nodePositions = {};
  const appSurfacePositions = {};

  for (const nodeId of activeNodeIds) {
    const position = previewState.nodePositions[nodeId] || autoLayoutEntityViewPosition(activeNodesById.get(nodeId));
    if (!position) {
      return null;
    }
    nodePositions[nodeId] = position;
  }
  for (const appId of appIds) {
    const position = previewState.appSurfacePositions[appId] || autoLayoutEntityViewPosition(appSurfacesById.get(appId));
    if (!position) {
      return null;
    }
    appSurfacePositions[appId] = position;
  }

  return {
    ...previewState,
    signature: autoLayoutFlowSignature(flow),
    entitySignature: autoLayoutEntitySignature(flow),
    appSurfacePositions,
    nodePositions
  };
}

function autoLayoutPreviewStateCanExtendToFlow(previewState, flow) {
  const previousIds = autoLayoutEntityIdsFromSignature(previewState.entitySignature || autoLayoutPreviewEntitySignature(previewState.signature));
  if (!previousIds) {
    return false;
  }
  const nextIds = autoLayoutCurrentEntityIds(flow);
  return autoLayoutSetIsSubset(previousIds.appIds, nextIds.appIds) &&
    autoLayoutSetIsSubset(previousIds.nodeIds, nextIds.nodeIds);
}

function autoLayoutCurrentEntityIds(flow) {
  return {
    appIds: new Set((Array.isArray(flow?.appSurfaces) ? flow.appSurfaces : [])
      .map((surface) => surface.appId)
      .filter((id) => typeof id === "string" && id)),
    nodeIds: new Set((Array.isArray(flow?.nodes) ? flow.nodes : [])
      .filter((node) => node.status !== "removed")
      .map((node) => node.nodeId)
      .filter((id) => typeof id === "string" && id))
  };
}

function autoLayoutEntityIdsFromSignature(signature) {
  const value = autoLayoutPreviewEntitySignature(signature);
  const appIds = autoLayoutSignaturePartIds(value, "apps");
  const nodeIds = autoLayoutSignaturePartIds(value, "nodes");
  if (!appIds || !nodeIds) {
    return null;
  }
  return {
    appIds: new Set(appIds),
    nodeIds: new Set(nodeIds)
  };
}

function autoLayoutSignaturePartIds(signature, key) {
  const match = String(signature || "").match(new RegExp(`(?:^|;)${key}:([^;]*)`));
  if (!match) {
    return null;
  }
  return match[1] ? match[1].split("|").filter(Boolean) : [];
}

function autoLayoutSetIsSubset(left, right) {
  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }
  return true;
}

function autoLayoutEntityViewPosition(entity) {
  return autoLayoutCopyPosition(entity?.view?.position);
}

function autoLayoutPreviewStateWithPosition(previewState, kind, id, position) {
  const normalized = autoLayoutNormalizePersistedPreviewState(previewState);
  const nextPosition = autoLayoutCopyPosition(position);
  if (!normalized || !nextPosition) {
    return null;
  }
  if (kind === "projectOverview") {
    return {
      ...normalized,
      projectOverviewPosition: nextPosition
    };
  } else if (kind === "appSurface") {
    normalized.appSurfacePositions[id] = nextPosition;
  } else {
    normalized.nodePositions[id] = nextPosition;
  }
  return normalized;
}

function autoLayoutNormalizePersistedPreviewState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.signature !== "string") {
    return null;
  }
  const projectOverviewPosition = autoLayoutCopyPosition(value.projectOverviewPosition);
  if (!projectOverviewPosition) {
    return null;
  }
  return {
    signature: value.signature,
    entitySignature: typeof value.entitySignature === "string" ? value.entitySignature : "",
    projectOverviewPosition,
    appSurfacePositions: autoLayoutReadPositionRecord(value.appSurfacePositions),
    nodePositions: autoLayoutReadPositionRecord(value.nodePositions)
  };
}

function autoLayoutEntitySignature(flow) {
  const appIds = (Array.isArray(flow?.appSurfaces) ? flow.appSurfaces : [])
    .map((surface) => surface.appId)
    .filter((id) => typeof id === "string" && id)
    .sort();
  const nodeIds = (Array.isArray(flow?.nodes) ? flow.nodes : [])
    .filter((node) => node.status !== "removed")
    .map((node) => node.nodeId)
    .filter((id) => typeof id === "string" && id)
    .sort();
  return `apps:${appIds.join("|")};nodes:${nodeIds.join("|")}`;
}

function autoLayoutFlowSignature(flow) {
  const edgeSignatures = (Array.isArray(flow?.edges) ? flow.edges : [])
    .filter((edge) => edge.status === "active")
    .map((edge) => autoLayoutEdgeSignature(edge))
    .sort();
  return `${autoLayoutEntitySignature(flow)};edges:${edgeSignatures.join("|")}`;
}

function autoLayoutPreviewStateMatchesFlow(previewState, flow) {
  const entitySignature = autoLayoutEntitySignature(flow);
  return previewState.signature === autoLayoutFlowSignature(flow) ||
    previewState.entitySignature === entitySignature ||
    autoLayoutPreviewEntitySignature(previewState.signature) === entitySignature;
}

function autoLayoutPreviewEntitySignature(signature) {
  const value = String(signature || "");
  const edgeIndex = value.indexOf(";edges:");
  return edgeIndex >= 0 ? value.slice(0, edgeIndex) : value;
}

function autoLayoutReadPositionRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((record, [id, position]) => {
    const normalized = autoLayoutCopyPosition(position);
    if (id && normalized) {
      record[id] = normalized;
    }
    return record;
  }, {});
}

function autoLayoutCopyPositionRecord(value) {
  return autoLayoutReadPositionRecord(value);
}

function autoLayoutCopyPosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

function autoLayoutEdgeSignature(edge) {
  return JSON.stringify([
    typeof edge.edgeId === "string" ? edge.edgeId : "",
    autoLayoutEndpointSignature(edge.from),
    autoLayoutEndpointSignature(edge.to),
    autoLayoutEdgePriority(edge.type),
    String(edge.trigger || edge.action || "")
  ]);
}

function autoLayoutEndpointSignature(endpoint) {
  if (endpoint && typeof endpoint === "object" && !Array.isArray(endpoint)) {
    return [
      typeof endpoint.kind === "string" ? endpoint.kind : "",
      typeof endpoint.nodeId === "string" ? endpoint.nodeId : "",
      typeof endpoint.appId === "string" ? endpoint.appId : "",
      typeof endpoint.groupId === "string" ? endpoint.groupId : "",
      typeof endpoint.itemId === "string" ? endpoint.itemId : ""
    ];
  }
  return ["invalid", "", "", "", ""];
}
