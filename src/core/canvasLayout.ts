import type { FlowEdge, FlowEndpoint, PageNode, ProductFlow } from "../models/productFlow";
import { nowIso } from "../utils/id";

const NODE_START_X = 0;
const NODE_START_Y = 0;
const NODE_COLUMN_GAP = 420;
const NODE_ROW_GAP = 320;
const NODE_WIDTH = 300;
const NODE_HEIGHT = 230;
const DUPLICATE_POSITION_TOLERANCE = 24;

interface Position {
  x: number;
  y: number;
}

export interface LayoutRepairResult {
  updatedNodeIds: string[];
}

export function ensureReasonableNodeLayout(flow: ProductFlow): LayoutRepairResult {
  const activeNodes = flow.nodes.filter((node) => node.status !== "removed");
  if (activeNodes.length === 0) {
    return { updatedNodeIds: [] };
  }

  const layers = assignNodeLayers(flow, activeNodes);
  const needsLayout = new Set<string>();
  const occupied: Position[] = [];

  for (const node of activeNodes) {
    const position = validNodePosition(node);
    if (!position || hasNearbyPosition(position, occupied, DUPLICATE_POSITION_TOLERANCE)) {
      needsLayout.add(node.nodeId);
      continue;
    }
    occupied.push(position);
  }

  if (needsLayout.size === 0) {
    return { updatedNodeIds: [] };
  }

  const updatedNodeIds: string[] = [];
  const placedRowsByLayer = new Map<number, number>();
  const orderedNodes = [...activeNodes].sort((left, right) => {
    const layerDiff = (layers.get(left.nodeId) ?? 0) - (layers.get(right.nodeId) ?? 0);
    return layerDiff || activeNodes.indexOf(left) - activeNodes.indexOf(right);
  });

  for (const node of orderedNodes) {
    if (!needsLayout.has(node.nodeId)) {
      continue;
    }
    const layer = layers.get(node.nodeId) ?? 0;
    const row = placedRowsByLayer.get(layer) ?? 0;
    const position = nextOpenPosition(layer, row, occupied);
    placedRowsByLayer.set(layer, Math.max(row + 1, Math.floor((position.y - NODE_START_Y) / NODE_ROW_GAP) + 1));
    node.view = {
      ...node.view,
      position
    };
    occupied.push(position);
    updatedNodeIds.push(node.nodeId);
  }

  if (updatedNodeIds.length > 0) {
    flow.revision += 1;
    flow.updatedAt = nowIso();
  }

  return { updatedNodeIds };
}

function assignNodeLayers(flow: ProductFlow, nodes: PageNode[]): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const layers = new Map(nodes.map((node) => [node.nodeId, 0]));
  const constraints = activeNodeLayerConstraints(flow, nodeIds);

  for (const constraint of constraints) {
    if (!constraint.fromNodeId && constraint.toNodeId) {
      layers.set(constraint.toNodeId, Math.max(layers.get(constraint.toNodeId) ?? 0, 1));
    }
  }

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const constraint of constraints) {
      if (!constraint.fromNodeId || !constraint.toNodeId) {
        continue;
      }
      const nextLayer = (layers.get(constraint.fromNodeId) ?? 0) + 1;
      if (nextLayer > (layers.get(constraint.toNodeId) ?? 0)) {
        layers.set(constraint.toNodeId, nextLayer);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  return layers;
}

function activeNodeLayerConstraints(flow: ProductFlow, nodeIds: Set<string>): Array<{ fromNodeId?: string; toNodeId?: string }> {
  return flow.edges
    .filter((edge) => edge.status === "active")
    .map((edge) => edgeToNodeConstraint(edge, nodeIds))
    .filter((constraint): constraint is { fromNodeId?: string; toNodeId?: string } => Boolean(constraint?.toNodeId));
}

function edgeToNodeConstraint(edge: FlowEdge, nodeIds: Set<string>): { fromNodeId?: string; toNodeId?: string } | undefined {
  const fromNodeId = endpointNodeId(edge.from, nodeIds) ?? (nodeIds.has(edge.fromNodeId) ? edge.fromNodeId : undefined);
  const toNodeId = endpointNodeId(edge.to, nodeIds) ?? (nodeIds.has(edge.toNodeId) ? edge.toNodeId : undefined);
  if (!toNodeId || fromNodeId === toNodeId) {
    return undefined;
  }
  return { fromNodeId, toNodeId };
}

function endpointNodeId(endpoint: FlowEndpoint | undefined, nodeIds: Set<string>): string | undefined {
  if (!endpoint || endpoint.kind === "appSurface" || endpoint.kind === "projectOverview") {
    return undefined;
  }
  return endpoint.nodeId && nodeIds.has(endpoint.nodeId) ? endpoint.nodeId : undefined;
}

function validNodePosition(node: PageNode): Position | undefined {
  const position = node.view?.position;
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return undefined;
  }
  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
}

function nextOpenPosition(layer: number, startRow: number, occupied: Position[]): Position {
  let row = startRow;
  while (row < startRow + 1000) {
    const position = {
      x: NODE_START_X + layer * NODE_COLUMN_GAP,
      y: NODE_START_Y + row * NODE_ROW_GAP
    };
    if (!hasOverlappingPosition(position, occupied)) {
      return position;
    }
    row += 1;
  }
  return {
    x: NODE_START_X + layer * NODE_COLUMN_GAP,
    y: NODE_START_Y + row * NODE_ROW_GAP
  };
}

function hasNearbyPosition(position: Position, occupied: Position[], tolerance: number): boolean {
  return occupied.some((item) =>
    Math.abs(item.x - position.x) <= tolerance &&
    Math.abs(item.y - position.y) <= tolerance
  );
}

function hasOverlappingPosition(position: Position, occupied: Position[]): boolean {
  return occupied.some((item) =>
    Math.abs(item.x - position.x) < NODE_WIDTH &&
    Math.abs(item.y - position.y) < NODE_HEIGHT
  );
}
