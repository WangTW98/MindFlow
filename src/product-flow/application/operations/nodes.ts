import {
  createFlowEdge,
  createFlowNode,
  removeFlowNode,
  updateFlowAppSurfacePosition,
  updateFlowNodeDetails,
  updateFlowNodePosition
} from "../../domain/editing/graph";
import { NODE_PAGE_TYPES, type FeatureGroup, type FlowEdge, type PageNode, type ProductFlow } from "../../domain";
import { nonEmptyArrayOr } from "./helpers";
import { nodeSelectionPatch } from "./selection";
import type { CreateConnectedNodeOperationInput, FlowOperation, FlowOperationResult, PasteNodesOperationInput } from "./types";

type NodeOperation = Extract<FlowOperation, { type: "appSurface.move" | "node.create" | "node.paste" | "node.update" | "node.move" | "node.remove" | "node.createConnected" }>;

export function applyNodeOperation(flow: ProductFlow, operation: NodeOperation): FlowOperationResult {
  switch (operation.type) {
    case "appSurface.move":
      return {
        type: operation.type,
        appSurface: updateFlowAppSurfacePosition(flow, operation.appId, operation.x, operation.y)
      };
    case "node.create": {
      const node = createFlowNode(flow, operation.input);
      if (operation.detailPatch && Object.keys(operation.detailPatch).length > 0) {
        updateFlowNodeDetails(flow, node.nodeId, operation.detailPatch);
      }
      return {
        type: operation.type,
        node,
        selection: nodeSelectionPatch(node.nodeId)
      };
    }
    case "node.paste": {
      const nodes = pasteFlowNodes(flow, operation.request);
      const primaryNode = nodes[operation.request.primaryIndex] ?? nodes[0];
      if (!primaryNode) {
        throw new Error("Node paste did not create a primary node.");
      }
      return {
        type: operation.type,
        nodes,
        selection: {
          selectedProjectOverview: false,
          selectedNodeId: primaryNode.nodeId,
          selectedNodeIds: nodes.map((node) => node.nodeId)
        }
      };
    }
    case "node.update": {
      const node = updateFlowNodeDetails(flow, operation.nodeId, operation.patch);
      return {
        type: operation.type,
        node,
        selection: nodeSelectionPatch(node.nodeId)
      };
    }
    case "node.move":
      return {
        type: operation.type,
        node: updateFlowNodePosition(flow, operation.nodeId, operation.x, operation.y)
      };
    case "node.remove": {
      const result = removeFlowNode(flow, operation.nodeId);
      return {
        type: operation.type,
        removedNodeId: result.node.nodeId,
        removedEdgeIds: result.removedEdges.map((edge) => edge.edgeId),
        result,
        selection: { selectedProjectOverview: false }
      };
    }
    case "node.createConnected": {
      const { node, edge } = createConnectedNode(flow, operation.request);
      return {
        type: operation.type,
        node,
        edge,
        selection: nodeSelectionPatch(node.nodeId)
      };
    }
  }
}

function pasteFlowNodes(flow: ProductFlow, request: PasteNodesOperationInput): PageNode[] {
  validatePasteNodesRequest(request);
  const appSurfaceIds = new Set((flow.appSurfaces || []).map((surface) => surface.appId));
  const domainIds = new Set((flow.domains || []).map((domain) => domain.domainId));
  const roleIds = new Set((flow.roles || []).map((role) => role.roleId));
  const statusGroupIds = new Set((flow.statusGroups || []).map((group) => group.statusGroupId));

  return request.nodes.map((snapshot) => {
    const pastedRoleIds = knownIds(snapshot.roleIds, roleIds);
    const node = createFlowNode(flow, {
      title: `${snapshot.title} 副本`,
      pageType: snapshot.pageType,
      purpose: snapshot.purpose,
      x: request.x + snapshot.offsetX,
      y: request.y + snapshot.offsetY,
      appSurfaceIds: knownIds(snapshot.appSurfaceIds, appSurfaceIds),
      domainIds: knownIds(snapshot.domainIds, domainIds),
      roleIds: pastedRoleIds,
      featureGroups: clipboardFeatureGroups(snapshot.featureGroups)
    });
    updateFlowNodeDetails(flow, node.nodeId, {
      statusGroupId: snapshot.statusGroupId && statusGroupIds.has(snapshot.statusGroupId)
        ? snapshot.statusGroupId
        : "",
      permissions: knownIds(snapshot.permissions, roleIds),
      featureGroups: clipboardFeatureGroups(snapshot.featureGroups)
    });
    return node;
  });
}

function validatePasteNodesRequest(request: PasteNodesOperationInput): void {
  if (!request || !Array.isArray(request.nodes) || request.nodes.length === 0) {
    throw new Error("Node paste requires at least one node.");
  }
  if (!Number.isFinite(request.x) || !Number.isFinite(request.y)) {
    throw new Error("Node paste position must use finite coordinates.");
  }
  if (!Number.isInteger(request.primaryIndex) || request.primaryIndex < 0 || request.primaryIndex >= request.nodes.length) {
    throw new Error("Node paste primary index is invalid.");
  }
  for (const snapshot of request.nodes) {
    if (!snapshot || !Number.isFinite(snapshot.offsetX) || !Number.isFinite(snapshot.offsetY)) {
      throw new Error("Node paste offsets must use finite coordinates.");
    }
    if (!(NODE_PAGE_TYPES as readonly string[]).includes(snapshot.pageType)) {
      throw new Error(`Node paste pageType must be ${NODE_PAGE_TYPES.join(", ")}.`);
    }
  }
}

function knownIds(values: readonly string[], known: ReadonlySet<string>): string[] {
  return Array.from(new Set(values.filter((value) => known.has(value))));
}

function clipboardFeatureGroups(groups: readonly FeatureGroup[]): FeatureGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item })),
    ...(group.actions
      ? {
          actions: group.actions.map((action) => {
            const { targetNodeId: _targetNodeId, ...copy } = action;
            return copy;
          })
        }
      : {})
  }));
}

function createConnectedNode(flow: ProductFlow, request: CreateConnectedNodeOperationInput): { node: PageNode; edge?: FlowEdge } {
  if (!request.from && !request.to) {
    throw new Error("Connected node creation requires from or to endpoint.");
  }
  const relatedNode = request.from
    ? request.from.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.from?.nodeId)
    : request.to?.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.to?.nodeId);
  const relatedAppSurfaceIds = request.from?.kind === "appSurface"
    ? [request.from.appId!]
    : request.to?.kind === "appSurface"
      ? [request.to.appId!]
      : relatedNode?.appSurfaceIds;
  const node = createFlowNode(flow, {
    ...request.input,
    x: request.x,
    y: request.y,
    appSurfaceIds: nonEmptyArrayOr(request.appSurfaceIds, relatedAppSurfaceIds),
    domainIds: nonEmptyArrayOr(request.domainIds, relatedNode?.domainIds),
    roleIds: nonEmptyArrayOr(request.roleIds, relatedNode?.roleIds)
  });
  if (request.detailPatch && Object.keys(request.detailPatch).length > 0) {
    updateFlowNodeDetails(flow, node.nodeId, request.detailPatch);
  }
  if (request.from) {
    return {
      node,
      edge: createFlowEdge(flow, {
        from: request.from,
        to: { kind: "node", nodeId: node.nodeId },
        trigger: request.trigger,
        type: request.type
      })
    };
  }
  if (request.to) {
    return {
      node,
      edge: createFlowEdge(flow, {
        from: { kind: "node", nodeId: node.nodeId },
        to: request.to,
        trigger: request.trigger,
        type: request.type
      })
    };
  }
  return { node };
}
