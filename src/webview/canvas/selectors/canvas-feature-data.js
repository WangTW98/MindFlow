function getFeatureGroups(node) {
  if (Array.isArray(node.featureGroups) && node.featureGroups.length > 0) {
    return node.featureGroups;
  }
  if (!Array.isArray(node.elements) || node.elements.length === 0) {
    return [];
  }
  return [
    {
      groupId: `group_legacy_${node.nodeId}`,
      name: "页面元素",
      type: "legacyElements",
      description: "由页面元素字段兼容展示。",
      items: node.elements.map((element) => ({
        itemId: `item_legacy_${element.elementId}`,
        name: element.name,
        type: element.type,
        description: element.description,
        dataBinding: element.dataBinding,
        required: element.required
      }))
    }
  ];
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
