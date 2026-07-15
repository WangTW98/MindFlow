function getFeatureGroups(node) {
  return Array.isArray(node.featureGroups) ? node.featureGroups : [];
}

function getEntryAppSurfaceNames(flow, node) {
  const entryIds = getEntryAppSurfaceIds(flow, node);
  if (entryIds.length === 0) {
    return "";
  }
  const surfaces = flow.appSurfaces || [];
  return entryIds
    .map((appId) => surfaces.find((surface) => surface.appId === appId)?.name || appId || "全部应用端")
    .join(" / ");
}

function getEntryAppSurfaceIds(flow, node) {
  const nodeAppIds = Array.isArray(node.appSurfaceIds) && node.appSurfaceIds.length > 0 ? node.appSurfaceIds : [""];
  return nodeAppIds.filter((appId) => {
    return !flow.edges.some((edge) => {
      if (edge.status !== "active" || edge.toNodeId !== node.nodeId) {
        return false;
      }
      if (edge.from?.kind === "appSurface") {
        const edgeAppId = endpointEntityId(edge.from);
        return !appId || edgeAppId === appId;
      }
      if (!appId) {
        return true;
      }
      const fromNode = flow.nodes.find((item) => item.nodeId === edge.fromNodeId);
      return Array.isArray(fromNode?.appSurfaceIds) && fromNode.appSurfaceIds.includes(appId);
    });
  });
}

function namesByIds(items, idKey, ids) {
  return ids
    .map((id) => items.find((item) => item[idKey] === id)?.name || id)
    .filter(Boolean)
    .join(" / ");
}
