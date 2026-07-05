function endpointFromButton(button) {
  if (button.dataset.originKind === "projectOverview") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  if (button.dataset.originKind === "appSurface") {
    const appId = button.dataset.originAppId || button.dataset.originNodeId;
    return appId ? { kind: "appSurface", nodeId: appId, appId } : null;
  }
  if (button.dataset.originKind === "node") {
    return button.dataset.originNodeId ? { kind: "node", nodeId: button.dataset.originNodeId } : null;
  }
  if (button.dataset.originKind === "featureGroup") {
    return button.dataset.originNodeId && button.dataset.originGroupId
      ? { kind: "featureGroup", nodeId: button.dataset.originNodeId, groupId: button.dataset.originGroupId }
      : null;
  }
  if (button.dataset.originKind === "featureItem") {
    return button.dataset.originNodeId && button.dataset.originGroupId && button.dataset.originItemId
      ? {
          kind: "featureItem",
          nodeId: button.dataset.originNodeId,
          groupId: button.dataset.originGroupId,
          itemId: button.dataset.originItemId
        }
      : null;
  }
  return null;
}

function endpointFromTargetButton(button) {
  if (button.dataset.targetKind === "projectOverview") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  if (button.dataset.targetKind === "appSurface") {
    const appId = button.dataset.targetAppId || button.dataset.targetNodeId;
    return appId ? { kind: "appSurface", nodeId: appId, appId } : null;
  }
  const nodeId = button.dataset.targetNodeId;
  return nodeId ? { kind: "node", nodeId } : null;
}

function endpointKey(endpoint) {
  return `${endpoint.kind}:${endpointEntityId(endpoint)}:${endpoint.groupId || ""}:${endpoint.itemId || ""}`;
}

function encodeEndpoint(endpoint) {
  return [endpoint.kind, endpointEntityId(endpoint), endpoint.groupId || "", endpoint.itemId || ""]
    .map((part) => encodeURIComponent(part))
    .join("|");
}

function parseEndpointValue(value, fallbackEndpoint) {
  const [kind, entityId, groupId, itemId] = String(value || "")
    .split("|")
    .map((part) => decodeEndpointPart(part));
  return createEndpointFromParts(kind, entityId, groupId, itemId) || normalizeFallbackEndpoint(fallbackEndpoint);
}

function createEndpointFromParts(kind, entityId, groupId, itemId) {
  if (kind === "projectOverview") {
    return { kind, nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  if (!entityId) {
    return undefined;
  }
  if (kind === "appSurface") {
    return { kind, nodeId: entityId, appId: entityId };
  }
  if (kind === "node") {
    return { kind, nodeId: entityId };
  }
  if (kind === "featureGroup" && groupId) {
    return { kind, nodeId: entityId, groupId };
  }
  if (kind === "featureItem" && groupId && itemId) {
    return { kind, nodeId: entityId, groupId, itemId };
  }
  return undefined;
}

function normalizeFallbackEndpoint(endpoint) {
  if (!endpoint || typeof endpoint.kind !== "string") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  const entityId = endpointEntityId(endpoint);
  return createEndpointFromParts(endpoint.kind, entityId, endpoint.groupId || "", endpoint.itemId || "") ||
    { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
}

function decodeEndpointPart(part) {
  try {
    return decodeURIComponent(part || "");
  } catch {
    return "";
  }
}

function endpointDisplayLabel(flow, endpoint) {
  if (endpoint.kind === "projectOverview") {
    return `项目概述 · ${flow.title || "项目概述"}`;
  }
  if (endpoint.kind === "appSurface") {
    const appId = endpointEntityId(endpoint);
    const surface = (flow.appSurfaces || []).find((item) => item.appId === appId);
    return `应用端卡片 · ${surface?.name || appId || ""}`;
  }
  const node = flow.nodes.find((item) => item.nodeId === endpoint.nodeId);
  if (!node) {
    return endpoint.nodeId || "";
  }
  if (endpoint.kind === "node") {
    return `节点卡片 · ${node.title}`;
  }
  const group = getFeatureGroups(node).find((item) => item.groupId === endpoint.groupId);
  if (endpoint.kind === "featureGroup") {
    return `功能分组 · ${group?.name || endpoint.groupId || ""}`;
  }
  const item = group?.items?.find((candidate) => candidate.itemId === endpoint.itemId);
  return `功能项 · ${item?.name || endpoint.itemId || ""}`;
}

function endpointEntityId(endpoint) {
  if (endpoint.kind === "projectOverview") {
    return PROJECT_OVERVIEW_NODE_ID;
  }
  return endpoint.kind === "appSurface" ? endpoint.appId || endpoint.nodeId || "" : endpoint.nodeId || "";
}

function endpointSearchText(parts) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
