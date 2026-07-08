const AUTO_LAYOUT_SHARED_LANE_ID = "__shared";
const AUTO_LAYOUT_ROOT_WIDTH = 340;
const AUTO_LAYOUT_ROOT_HEIGHT = 260;
const AUTO_LAYOUT_APP_WIDTH = 300;
const AUTO_LAYOUT_APP_HEIGHT = 160;
const AUTO_LAYOUT_NODE_WIDTH = 300;
const AUTO_LAYOUT_NODE_HEIGHT = 230;
const AUTO_LAYOUT_MIN_COLUMN_GAP = 520;
const AUTO_LAYOUT_ROW_GAP = 340;
const AUTO_LAYOUT_LANE_GAP = 220;
const AUTO_LAYOUT_RECT_MARGIN = 44;
const AUTO_LAYOUT_FIT_PADDING = 72;
const AUTO_LAYOUT_ROW_SAFETY_GAP = 110;
const AUTO_LAYOUT_SUBCOLUMN_GAP = 160;
const AUTO_LAYOUT_MAX_ROWS_PER_SUBCOLUMN = 8;
const AUTO_LAYOUT_ROW_X_STAGGER = 36;
const AUTO_LAYOUT_MAX_ROW_X_STAGGER = AUTO_LAYOUT_ROW_X_STAGGER * 2;
const AUTO_LAYOUT_LAYER_Y_OFFSETS = {
  2: -22,
  3: 18,
  4: -12,
  5: 26
};
const AUTO_LAYOUT_EDGE_TYPE_PRIORITIES = {
  nestedRelation: 0,
  interaction: 1,
  autoNavigate: 2,
  statusChange: 3,
  dataFlow: 4
};
const AUTO_LAYOUT_UNCONNECTED_PRIORITY = Number.POSITIVE_INFINITY;

function autoLayoutComputePreview(flow, measurements = {}) {
  const activeNodes = (Array.isArray(flow?.nodes) ? flow.nodes : []).filter((node) => node.status !== "removed");
  const activeEdges = (Array.isArray(flow?.edges) ? flow.edges : []).filter((edge) => edge.status === "active");
  const appSurfaces = Array.isArray(flow?.appSurfaces) ? flow.appSurfaces : [];
  const estimatedMaxEdgeLabelWidth = activeEdges.reduce((maxWidth, edge) => {
    return Math.max(maxWidth, autoLayoutEstimateLabelWidth(edge.trigger || edge.action || ""));
  }, 0);
  const context = autoLayoutCreateContext(appSurfaces, activeNodes);
  const projectOverviewSize = autoLayoutMeasuredSize(measurements.projectOverview, AUTO_LAYOUT_ROOT_WIDTH, AUTO_LAYOUT_ROOT_HEIGHT);
  const lanePlans = context.lanes.map((lane) => autoLayoutCreateLanePlan(lane, activeEdges, context.nodeOriginalIndex, measurements));
  const maxLayerWidthSpan = lanePlans.reduce((maxWidth, plan) => {
    const layerWidth = Array.from(plan.layerLayouts.values()).reduce((maxLayerWidth, layout) => Math.max(maxLayerWidth, layout.widthSpan), 0);
    return Math.max(maxWidth, plan.appSize?.width || 0, layerWidth);
  }, projectOverviewSize.width);
  const columnGap = Math.max(AUTO_LAYOUT_MIN_COLUMN_GAP, maxLayerWidthSpan + estimatedMaxEdgeLabelWidth + 96);
  const itemRects = [];
  const nodePositions = {};
  const appSurfacePositions = {};
  const nodeLaneIds = {};
  const laneSummaries = [];
  let nextLaneY = 0;

  for (const plan of lanePlans) {
    const lane = plan.lane;
    const laneRectStart = itemRects.length;
    const laneHeight = plan.laneHeight;
    const laneTop = nextLaneY;

    if (lane.surface) {
      const appY = Math.round(laneTop + (laneHeight - plan.appSize.height) / 2);
      const appPosition = autoLayoutPlaceRect(itemRects, {
        id: lane.surface.appId,
        kind: "appSurface",
        laneId: lane.id,
        layer: 1,
        x: columnGap,
        y: appY,
        width: plan.appSize.width,
        height: plan.appSize.height
      });
      appSurfacePositions[lane.surface.appId] = { x: appPosition.x, y: appPosition.y };
    }

    for (const layer of plan.layers) {
      const layout = plan.layerLayouts.get(layer);
      autoLayoutPlaceLayerNodes(layout.nodes, layout, layer, lane, laneTop, laneHeight, columnGap, itemRects, nodePositions, nodeLaneIds, plan.graphEdges, plan.nodeOrder);
    }

    const laneBounds = autoLayoutBoundsForItems(itemRects.slice(laneRectStart));
    if (laneBounds) {
      laneSummaries.push({
        id: lane.id,
        kind: lane.kind,
        top: laneBounds.minY,
        bottom: laneBounds.maxY,
        nodeCount: lane.nodes.length
      });
      nextLaneY = laneBounds.maxY + AUTO_LAYOUT_LANE_GAP;
    } else {
      nextLaneY += laneHeight + AUTO_LAYOUT_LANE_GAP;
    }
  }

  const laneBounds = autoLayoutBoundsForItems(itemRects);
  const rootCenterY = laneBounds ? (laneBounds.minY + laneBounds.maxY) / 2 : 0;
  const projectOverviewPosition = {
    x: 0,
    y: Math.round(rootCenterY - projectOverviewSize.height / 2)
  };
  itemRects.push({
    id: "projectOverview",
    kind: "projectOverview",
    laneId: "root",
    layer: 0,
    x: projectOverviewPosition.x,
    y: projectOverviewPosition.y,
    width: projectOverviewSize.width,
    height: projectOverviewSize.height
  });

  return {
    projectOverviewPosition,
    appSurfacePositions,
    nodePositions,
    nodeLaneIds,
    lanes: laneSummaries,
    items: itemRects,
    bounds: autoLayoutExpandBounds(autoLayoutBoundsForItems(itemRects), AUTO_LAYOUT_FIT_PADDING),
    columnGap,
    rowGap: AUTO_LAYOUT_ROW_GAP,
    estimatedMaxEdgeLabelWidth
  };
}

function autoLayoutCreateContext(appSurfaces, activeNodes) {
  const laneById = new Map();
  const lanes = appSurfaces.map((surface) => {
    const lane = { id: surface.appId, kind: "appSurface", surface, nodes: [] };
    laneById.set(surface.appId, lane);
    return lane;
  });
  const sharedLane = { id: AUTO_LAYOUT_SHARED_LANE_ID, kind: "shared", surface: null, nodes: [] };
  const nodeOriginalIndex = new Map();
  activeNodes.forEach((node, index) => {
    nodeOriginalIndex.set(node.nodeId, index);
    const lane = autoLayoutResolveNodeLane(node, laneById, sharedLane);
    lane.nodes.push(node);
  });
  if (sharedLane.nodes.length > 0 || lanes.length === 0 && activeNodes.length > 0) {
    lanes.push(sharedLane);
  }
  return { lanes, nodeOriginalIndex };
}

function autoLayoutResolveNodeLane(node, laneById, sharedLane) {
  const ids = Array.isArray(node.appSurfaceIds) ? node.appSurfaceIds : [];
  for (const appId of ids) {
    const lane = laneById.get(appId);
    if (lane) {
      return lane;
    }
  }
  return sharedLane;
}

function autoLayoutCreateLanePlan(lane, activeEdges, nodeOriginalIndex, measurements) {
  const nodeIds = new Set(lane.nodes.map((node) => node.nodeId));
  const graphEdges = autoLayoutBuildLaneGraphEdges(nodeIds, activeEdges, nodeOriginalIndex);
  const orderedNodes = autoLayoutOrderLaneNodesFromGraph(lane.nodes, graphEdges, nodeOriginalIndex);
  const nodeLayers = autoLayoutAssignNodeLayers(orderedNodes, graphEdges);
  const nodeOrder = new Map(orderedNodes.map((node, index) => [node.nodeId, index]));
  const nodesByLayer = autoLayoutGroupNodesByLayer(orderedNodes, nodeLayers);
  const layers = Array.from(nodesByLayer.keys()).sort((left, right) => left - right);
  const layerLayouts = new Map();
  for (const layer of layers) {
    const nodes = nodesByLayer.get(layer);
    layerLayouts.set(layer, autoLayoutCreateLayerLayout(nodes, measurements));
  }
  const appSize = lane.surface ? autoLayoutMeasuredSize(measurements.appSurfaces?.[lane.surface.appId], AUTO_LAYOUT_APP_WIDTH, AUTO_LAYOUT_APP_HEIGHT) : null;
  const laneHeight = Math.max(
    appSize?.height || 0,
    ...Array.from(layerLayouts.values()).map((layout) => layout.heightSpan),
    AUTO_LAYOUT_NODE_HEIGHT
  );
  return {
    lane,
    appSize,
    layers,
    layerLayouts,
    graphEdges,
    nodeLayers,
    nodeOrder,
    laneHeight
  };
}

function autoLayoutCreateLayerLayout(nodes, measurements) {
  const sizes = new Map();
  let maxWidth = AUTO_LAYOUT_NODE_WIDTH;
  let maxHeight = AUTO_LAYOUT_NODE_HEIGHT;
  for (const node of nodes) {
    const size = autoLayoutMeasuredSize(measurements.nodes?.[node.nodeId], AUTO_LAYOUT_NODE_WIDTH, AUTO_LAYOUT_NODE_HEIGHT);
    sizes.set(node.nodeId, size);
    maxWidth = Math.max(maxWidth, size.width);
    maxHeight = Math.max(maxHeight, size.height);
  }
  const maxRows = Math.max(1, Math.min(AUTO_LAYOUT_MAX_ROWS_PER_SUBCOLUMN, nodes.length || 1));
  const columnCount = Math.max(1, Math.ceil(nodes.length / maxRows));
  const rowCount = Math.max(1, Math.min(nodes.length || 1, maxRows));
  const rowStep = Math.max(AUTO_LAYOUT_ROW_GAP, maxHeight + AUTO_LAYOUT_ROW_SAFETY_GAP);
  const columnStep = maxWidth + AUTO_LAYOUT_SUBCOLUMN_GAP;
  return {
    nodes,
    sizes,
    maxRows,
    rowCount,
    columnCount,
    rowStep,
    columnStep,
    maxWidth,
    maxHeight,
    widthSpan: (columnCount - 1) * columnStep + maxWidth + AUTO_LAYOUT_MAX_ROW_X_STAGGER,
    heightSpan: (rowCount - 1) * rowStep + maxHeight
  };
}

function autoLayoutMeasuredSize(value, fallbackWidth, fallbackHeight) {
  const width = Number(value?.width);
  const height = Number(value?.height);
  return {
    width: Math.max(fallbackWidth, Number.isFinite(width) ? Math.ceil(width) : fallbackWidth),
    height: Math.max(fallbackHeight, Number.isFinite(height) ? Math.ceil(height) : fallbackHeight)
  };
}

function autoLayoutOrderLaneNodesFromGraph(nodes, graphEdges, nodeOriginalIndex) {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const outgoing = new Map(nodes.map((node) => [node.nodeId, []]));
  const indegree = new Map(nodes.map((node) => [node.nodeId, 0]));
  const incomingPriority = new Map(nodes.map((node) => [node.nodeId, AUTO_LAYOUT_UNCONNECTED_PRIORITY]));

  for (const edge of graphEdges) {
    outgoing.get(edge.fromId)?.push(edge);
    indegree.set(edge.toId, (indegree.get(edge.toId) || 0) + 1);
    incomingPriority.set(edge.toId, Math.min(incomingPriority.get(edge.toId) ?? AUTO_LAYOUT_UNCONNECTED_PRIORITY, edge.priority));
  }
  for (const edges of outgoing.values()) {
    edges.sort((left, right) => autoLayoutCompareGraphEdges(left, right, nodeOriginalIndex));
  }

  const ordered = [];
  const ready = nodes
    .filter((node) => (indegree.get(node.nodeId) || 0) === 0)
    .sort((left, right) => autoLayoutCompareReadyNodes(left, right, incomingPriority, nodeOriginalIndex));
  const seen = new Set();
  while (ready.length > 0) {
    const node = ready.shift();
    if (!node || seen.has(node.nodeId)) {
      continue;
    }
    ordered.push(node);
    seen.add(node.nodeId);
    for (const edge of outgoing.get(node.nodeId) || []) {
      const nextIndegree = (indegree.get(edge.toId) || 0) - 1;
      indegree.set(edge.toId, nextIndegree);
      if (nextIndegree === 0) {
        const targetNode = byId.get(edge.toId);
        if (targetNode && !seen.has(edge.toId)) {
          ready.push(targetNode);
          ready.sort((left, right) => autoLayoutCompareReadyNodes(left, right, incomingPriority, nodeOriginalIndex));
        }
      }
    }
  }

  const remaining = nodes
    .filter((node) => !seen.has(node.nodeId))
    .sort((left, right) => autoLayoutCompareNodes(left, right, nodeOriginalIndex));
  return [...ordered, ...remaining];
}

function autoLayoutAssignNodeLayers(orderedNodes, graphEdges) {
  const layers = new Map(orderedNodes.map((node) => [node.nodeId, 2]));
  const outgoing = new Map(orderedNodes.map((node) => [node.nodeId, []]));
  for (const edge of graphEdges) {
    outgoing.get(edge.fromId)?.push(edge);
  }
  for (const node of orderedNodes) {
    const baseLayer = layers.get(node.nodeId) ?? 2;
    for (const edge of outgoing.get(node.nodeId) || []) {
      layers.set(edge.toId, Math.max(layers.get(edge.toId) ?? 2, baseLayer + 1));
    }
  }
  return layers;
}

function autoLayoutBuildLaneGraphEdges(nodeIds, activeEdges, nodeOriginalIndex) {
  const strongestByPair = new Map();
  activeEdges.forEach((edge, index) => {
    const fromId = autoLayoutEdgeNodeId(edge.from, edge.fromNodeId);
    const toId = autoLayoutEdgeNodeId(edge.to, edge.toNodeId);
    if (!fromId || !toId || fromId === toId || !nodeIds.has(fromId) || !nodeIds.has(toId)) {
      return;
    }
    const graphEdge = {
      fromId,
      toId,
      priority: autoLayoutEdgePriority(edge.type),
      index
    };
    const key = `${fromId}\u0000${toId}`;
    const existing = strongestByPair.get(key);
    if (!existing || autoLayoutCompareGraphEdges(graphEdge, existing, nodeOriginalIndex) < 0) {
      strongestByPair.set(key, graphEdge);
    }
  });

  const candidates = Array.from(strongestByPair.values())
    .sort((left, right) => autoLayoutCompareGraphEdges(left, right, nodeOriginalIndex));
  const kept = [];
  const outgoing = new Map(Array.from(nodeIds, (nodeId) => [nodeId, []]));
  for (const edge of candidates) {
    if (autoLayoutGraphHasPath(outgoing, edge.toId, edge.fromId)) {
      continue;
    }
    outgoing.get(edge.fromId)?.push(edge.toId);
    kept.push(edge);
  }
  return kept.sort((left, right) => autoLayoutCompareGraphEdges(left, right, nodeOriginalIndex));
}

function autoLayoutGraphHasPath(outgoing, startId, targetId) {
  if (startId === targetId) {
    return true;
  }
  const stack = [startId];
  const seen = new Set();
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || seen.has(nodeId)) {
      continue;
    }
    seen.add(nodeId);
    for (const nextId of outgoing.get(nodeId) || []) {
      if (nextId === targetId) {
        return true;
      }
      stack.push(nextId);
    }
  }
  return false;
}

function autoLayoutCompareGraphEdges(left, right, nodeOriginalIndex) {
  return (left.priority - right.priority) ||
    autoLayoutCompareNodeIds(left.fromId, right.fromId, nodeOriginalIndex) ||
    autoLayoutCompareNodeIds(left.toId, right.toId, nodeOriginalIndex) ||
    (left.index - right.index);
}

function autoLayoutCompareNodeIds(leftId, rightId, nodeOriginalIndex) {
  return (nodeOriginalIndex.get(leftId) ?? 0) - (nodeOriginalIndex.get(rightId) ?? 0) ||
    String(leftId || "").localeCompare(String(rightId || ""));
}

function autoLayoutCompareReadyNodes(left, right, incomingPriority, nodeOriginalIndex) {
  const priorityDiff = (incomingPriority.get(left.nodeId) ?? AUTO_LAYOUT_UNCONNECTED_PRIORITY) -
    (incomingPriority.get(right.nodeId) ?? AUTO_LAYOUT_UNCONNECTED_PRIORITY);
  return priorityDiff || autoLayoutCompareNodes(left, right, nodeOriginalIndex);
}

function autoLayoutGroupNodesByLayer(nodes, nodeLayers) {
  const groups = new Map();
  for (const node of nodes) {
    const layer = nodeLayers.get(node.nodeId) ?? 2;
    if (!groups.has(layer)) {
      groups.set(layer, []);
    }
    groups.get(layer).push(node);
  }
  return groups;
}

function autoLayoutPlaceLayerNodes(nodes, layout, layer, lane, laneTop, laneHeight, columnGap, itemRects, nodePositions, nodeLaneIds, graphEdges, nodeOrder) {
  const fallbackStartY = autoLayoutLayerStartY(laneTop, laneHeight, layout, layer);
  const sorted = autoLayoutOrderLayerNodesForPlacement(nodes, nodePositions, graphEdges, nodeOrder);
  sorted.forEach((node, index) => {
    const row = index % layout.maxRows;
    const column = Math.floor(index / layout.maxRows);
    const size = layout.sizes.get(node.nodeId) || { width: AUTO_LAYOUT_NODE_WIDTH, height: AUTO_LAYOUT_NODE_HEIGHT };
    const parentY = autoLayoutIncomingGraphParentY(node.nodeId, nodePositions, graphEdges);
    const desiredY = Number.isFinite(parentY)
      ? parentY
      : Math.round(fallbackStartY + row * layout.rowStep);
    const position = autoLayoutPlaceRect(itemRects, {
      id: node.nodeId,
      kind: "node",
      laneId: lane.id,
      layer,
      x: autoLayoutLayerX(layer, columnGap, layout, column, row),
      y: desiredY,
      width: size.width,
      height: size.height
    });
    nodePositions[node.nodeId] = { x: position.x, y: position.y };
    nodeLaneIds[node.nodeId] = lane.id;
  });
}

function autoLayoutOrderLayerNodesForPlacement(nodes, nodePositions, graphEdges, nodeOrder) {
  return [...nodes].sort((left, right) => {
    const leftParentY = autoLayoutIncomingGraphParentY(left.nodeId, nodePositions, graphEdges);
    const rightParentY = autoLayoutIncomingGraphParentY(right.nodeId, nodePositions, graphEdges);
    if (leftParentY !== rightParentY) {
      if (!Number.isFinite(leftParentY)) {
        return 1;
      }
      if (!Number.isFinite(rightParentY)) {
        return -1;
      }
      return leftParentY - rightParentY;
    }
    return (nodeOrder.get(left.nodeId) ?? 0) - (nodeOrder.get(right.nodeId) ?? 0);
  });
}

function autoLayoutPlaceRect(itemRects, rect) {
  const placed = { ...rect, x: Math.round(rect.x), y: Math.round(rect.y) };
  let attempts = 0;
  while (autoLayoutHasRectCollision(placed, itemRects) && attempts < 1000) {
    placed.y += Math.max(AUTO_LAYOUT_ROW_GAP, placed.height + AUTO_LAYOUT_RECT_MARGIN * 2);
    attempts += 1;
  }
  itemRects.push(placed);
  return { x: placed.x, y: placed.y };
}

function autoLayoutHasRectCollision(rect, itemRects) {
  return itemRects.some((item) => {
    return rect.x - AUTO_LAYOUT_RECT_MARGIN < item.x + item.width + AUTO_LAYOUT_RECT_MARGIN &&
      rect.x + rect.width + AUTO_LAYOUT_RECT_MARGIN > item.x - AUTO_LAYOUT_RECT_MARGIN &&
      rect.y - AUTO_LAYOUT_RECT_MARGIN < item.y + item.height + AUTO_LAYOUT_RECT_MARGIN &&
      rect.y + rect.height + AUTO_LAYOUT_RECT_MARGIN > item.y - AUTO_LAYOUT_RECT_MARGIN;
  });
}

function autoLayoutLayerStartY(laneTop, laneHeight, layout, layer) {
  if (!layout || layout.nodes.length === 0) {
    return laneTop + laneHeight / 2;
  }
  const offset = AUTO_LAYOUT_LAYER_Y_OFFSETS[layer] || 0;
  return laneTop + (laneHeight - layout.heightSpan) / 2 + offset;
}

function autoLayoutLayerX(layer, columnGap, layout, column, row) {
  return layer * columnGap + column * layout.columnStep + (row % 3) * AUTO_LAYOUT_ROW_X_STAGGER;
}

function autoLayoutIncomingGraphParentY(nodeId, nodePositions, graphEdges) {
  const parentYs = [];
  let bestPriority = AUTO_LAYOUT_UNCONNECTED_PRIORITY;
  for (const edge of graphEdges) {
    if (edge.toId !== nodeId) {
      continue;
    }
    const position = nodePositions[edge.fromId];
    if (position && Number.isFinite(position.y)) {
      const priority = edge.priority;
      if (priority > bestPriority) {
        continue;
      }
      if (priority < bestPriority) {
        parentYs.length = 0;
        bestPriority = priority;
      }
      parentYs.push(position.y);
    }
  }
  return parentYs.length > 0 ? Math.round(parentYs.reduce((sum, y) => sum + y, 0) / parentYs.length) : Number.POSITIVE_INFINITY;
}

function autoLayoutEdgeNodeId(endpoint, fallbackNodeId) {
  if (endpoint && endpoint.kind !== "appSurface" && endpoint.kind !== "projectOverview" && typeof endpoint.nodeId === "string") {
    return endpoint.nodeId;
  }
  return typeof fallbackNodeId === "string" ? fallbackNodeId : "";
}


function autoLayoutEdgePriority(type) {
  return AUTO_LAYOUT_EDGE_TYPE_PRIORITIES[autoLayoutNormalizeEdgeType(type)] ?? AUTO_LAYOUT_EDGE_TYPE_PRIORITIES.interaction;
}

function autoLayoutNormalizeEdgeType(type) {
  if (type === "nestedRelation") {
    return "nestedRelation";
  }
  if (type === "statusChange") {
    return "statusChange";
  }
  if (type === "autoNavigate" || type === "navigate" || type === "branch") {
    return "autoNavigate";
  }
  if (type === "dataFlow" || type === "system") {
    return "dataFlow";
  }
  return "interaction";
}

function autoLayoutCompareNodes(left, right, nodeOriginalIndex) {
  const indexDiff = (nodeOriginalIndex.get(left.nodeId) ?? 0) - (nodeOriginalIndex.get(right.nodeId) ?? 0);
  return indexDiff || String(left.title || "").localeCompare(String(right.title || "")) || left.nodeId.localeCompare(right.nodeId);
}

function autoLayoutEstimateLabelWidth(value) {
  return Array.from(String(value || "")).reduce((width, character) => {
    return width + (character.charCodeAt(0) > 255 ? 11 : 6);
  }, 16);
}

function autoLayoutBoundsForItems(items) {
  if (!items || items.length === 0) {
    return null;
  }
  return items.reduce((bounds, item) => ({
    minX: Math.min(bounds.minX, item.x),
    minY: Math.min(bounds.minY, item.y),
    maxX: Math.max(bounds.maxX, item.x + item.width),
    maxY: Math.max(bounds.maxY, item.y + item.height)
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  });
}

function autoLayoutExpandBounds(bounds, padding) {
  if (!bounds) {
    return {
      minX: -padding,
      minY: -padding,
      maxX: padding,
      maxY: padding
    };
  }
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding
  };
}
