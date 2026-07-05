import * as vscode from "vscode";
import type { EdgeType, FlowEndpoint } from "../../models/productFlow";
import { createManualEdge, createManualNode, removeManualEdge, removeManualNode, updateManualAppSurfacePosition, updateManualEdgeDetails, updateManualNodeDetails, updateManualNodePosition, type UpdateEdgeDetailsInput, type UpdateNodeDetailsInput } from "../../core/flowEditing";
import { updateProjectOverview, updateProjectOverviewPosition, type UpdateProjectOverviewInput } from "../../core/projectOverview";
import { FlowPanel } from "../../webview/FlowPanel";
import { applyFlowDocumentEdit, loadCurrentFlow, showError, type FlowUriArgument } from "../flowContext";
import { hasOptionalFiniteCoordinates, isPlainObject, readFiniteCoordinates } from "./guards";

export interface CreateConnectedNodeRequest {
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  x?: number;
  y?: number;
  trigger?: string;
  type?: EdgeType;
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
}

export async function updateNodePosition(nodeId?: string, x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    const coordinates = readFiniteCoordinates(x, y);
    if (!nodeId || !coordinates) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateManualNodePosition(flow, nodeId, coordinates.x, coordinates.y);
    await applyFlowDocumentEdit(flowUri, flow);
    return true;
  } catch (error) {
    showError("Update node position failed", error);
    return false;
  }
}

export async function updateAppSurfacePosition(appId?: string, x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    const coordinates = readFiniteCoordinates(x, y);
    if (!appId || !coordinates) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateManualAppSurfacePosition(flow, appId, coordinates.x, coordinates.y);
    await applyFlowDocumentEdit(flowUri, flow);
    return true;
  } catch (error) {
    showError("Update app surface position failed", error);
    return false;
  }
}

export async function saveProjectOverviewPosition(x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    const coordinates = readFiniteCoordinates(x, y);
    if (!coordinates) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateProjectOverviewPosition(flow, coordinates.x, coordinates.y);
    await applyFlowDocumentEdit(flowUri, flow);
    return true;
  } catch (error) {
    showError("Update project overview position failed", error);
    return false;
  }
}

export async function createNodeAt(
  context: vscode.ExtensionContext,
  x?: number,
  y?: number,
  appSurfaceIds?: string[],
  domainIds?: string[],
  roleIds?: string[],
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  try {
    if (!hasOptionalFiniteCoordinates(x, y)) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    const node = createManualNode(flow, {
      x,
      y,
      appSurfaceIds: Array.isArray(appSurfaceIds) ? appSurfaceIds : undefined,
      domainIds: Array.isArray(domainIds) ? domainIds : undefined,
      roleIds: Array.isArray(roleIds) ? roleIds : undefined
    });
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: false, selectedNodeId: node.nodeId });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Create node failed", error);
    return false;
  }
}

export async function updateNodeDetails(context: vscode.ExtensionContext, nodeId?: string, patch?: UpdateNodeDetailsInput, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!nodeId || !isPlainObject<UpdateNodeDetailsInput>(patch)) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateManualNodeDetails(flow, nodeId, patch);
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: false, selectedNodeId: nodeId });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Update node details failed", error);
    return false;
  }
}

export async function updateProjectOverviewDetails(context: vscode.ExtensionContext, patch?: UpdateProjectOverviewInput, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!isPlainObject<UpdateProjectOverviewInput>(patch)) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateProjectOverview(flow, patch);
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: true });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Update project overview failed", error);
    return false;
  }
}

export async function createEdge(
  context: vscode.ExtensionContext,
  from?: FlowEndpoint,
  to?: FlowEndpoint,
  trigger?: string,
  type?: EdgeType,
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  try {
    if (!from || !to) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    const edge = createManualEdge(flow, { from, to, trigger, type });
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: false, selectedEdgeId: edge.edgeId });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Create edge failed", error);
    return false;
  }
}

export async function createConnectedNodeAt(context: vscode.ExtensionContext, request?: CreateConnectedNodeRequest, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!isPlainObject<CreateConnectedNodeRequest>(request) || (!request.from && !request.to) || !hasOptionalFiniteCoordinates(request.x, request.y)) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    const relatedNode = request.from
      ? request.from.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.from?.nodeId)
      : request.to?.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.to?.nodeId);
    const relatedAppSurfaceIds = request.from?.kind === "appSurface"
      ? [request.from.appId ?? request.from.nodeId]
      : request.to?.kind === "appSurface"
        ? [request.to.appId ?? request.to.nodeId]
        : relatedNode?.appSurfaceIds;
    const node = createManualNode(flow, {
      x: request.x,
      y: request.y,
      appSurfaceIds: nonEmptyArrayOr(request.appSurfaceIds, relatedAppSurfaceIds),
      domainIds: nonEmptyArrayOr(request.domainIds, relatedNode?.domainIds),
      roleIds: nonEmptyArrayOr(request.roleIds, relatedNode?.roleIds)
    });
    if (request.from) {
      createManualEdge(flow, {
        from: request.from,
        to: { kind: "node", nodeId: node.nodeId },
        trigger: request.trigger,
        type: request.type
      });
    } else if (request.to) {
      createManualEdge(flow, {
        from: { kind: "node", nodeId: node.nodeId },
        to: request.to,
        trigger: request.trigger,
        type: request.type
      });
    }
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: false, selectedNodeId: node.nodeId });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Create connected node failed", error);
    return false;
  }
}

function nonEmptyArrayOr(value: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

export async function deleteNode(context: vscode.ExtensionContext, nodeId?: string, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!nodeId) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    removeManualNode(flow, nodeId);
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: false });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Delete node failed", error);
    return false;
  }
}

export async function updateEdgeDetails(context: vscode.ExtensionContext, edgeId?: string, patch?: UpdateEdgeDetailsInput, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!edgeId || !isPlainObject<UpdateEdgeDetailsInput>(patch)) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateManualEdgeDetails(flow, edgeId, patch);
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: false, selectedEdgeId: edgeId });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Update edge details failed", error);
    return false;
  }
}

export async function disconnectEdge(context: vscode.ExtensionContext, edgeId?: string, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!edgeId) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    removeManualEdge(flow, edgeId);
    await applyFlowDocumentEdit(flowUri, flow);
    FlowPanel.setSelection(flowUri, { selectedProjectOverview: false });
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Disconnect edge failed", error);
    return false;
  }
}
