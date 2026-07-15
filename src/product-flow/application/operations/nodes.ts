import {
  createFlowEdge,
  createFlowNode,
  removeFlowNode,
  updateFlowAppSurfacePosition,
  updateFlowNodeDetails,
  updateFlowNodePosition
} from "../../domain/editing/graph";
import type { FlowEdge, PageNode, ProductFlow } from "../../domain";
import { nonEmptyArrayOr } from "./helpers";
import { nodeSelectionPatch } from "./selection";
import type { CreateConnectedNodeOperationInput, FlowOperation, FlowOperationResult } from "./types";

type NodeOperation = Extract<FlowOperation, { type: "appSurface.move" | "node.create" | "node.update" | "node.move" | "node.remove" | "node.createConnected" }>;

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
