import * as path from "node:path";
import * as vscode from "vscode";
import type { EdgeType, FlowEndpoint } from "../models/productFlow";
import { validateProductFlow } from "../models/productFlow";
import {
  createManualEdge,
  createManualNode,
  removeManualEdge,
  removeManualNode,
  updateManualAppSurfacePosition,
  updateManualEdgeDetails,
  updateManualNodeDetails,
  updateManualNodePosition,
  type UpdateEdgeDetailsInput,
  type UpdateNodeDetailsInput
} from "../core/flowEditing";
import { createEmptyProductFlow } from "../core/emptyFlow";
import {
  updateProjectOverview,
  updateProjectOverviewPosition,
  type UpdateProjectOverviewInput
} from "../core/projectOverview";
import { applyTaxonomyRequest, type TaxonomyRequest } from "../core/taxonomy";
import { createUntitledMindFlowDocumentOptions } from "../core/untitledMindFlowDocument";
import { FlowRepository } from "../storage/flowRepository";
import { FlowPanel } from "../webview/FlowPanel";
import type { SidebarView } from "../webview/SidebarView";
import {
  applyFlowDocumentEdit,
  ensureMindFlowExtension,
  flowDisplayName,
  getDefaultSaveUri,
  isMindFlowDocument,
  loadCurrentFlow,
  loadMindFlowFile,
  pickMindFlowFile,
  rememberRecentFlow,
  rememberUntitledFlow,
  resolveInputFlowPath,
  showError,
  type FlowUriArgument
} from "./flowContext";

export function registerMindFlowCommands(
  context: vscode.ExtensionContext,
  sidebarView: SidebarView | undefined
): vscode.Disposable[] {
  return [
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isMindFlowDocument(document)) {
        void rememberRecentFlow(context, sidebarView, document.uri.fsPath);
      }
    }),
    vscode.commands.registerCommand("mindflow.newFlow", () => newFlow()),
    vscode.commands.registerCommand("mindflow.openFlow", (flowPath?: string) => openFlow(context, sidebarView, flowPath)),
    vscode.commands.registerCommand("mindflow.saveFlowAs", (flowUri?: FlowUriArgument) => saveFlowAs(context, sidebarView, flowUri)),
    vscode.commands.registerCommand("mindflow.validateFlowJson", () => validateFlowJson(context)),
    vscode.commands.registerCommand("mindflow.updateNodePosition", (nodeId?: string, x?: number, y?: number, flowUri?: FlowUriArgument) =>
      updateNodePosition(nodeId, x, y, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateAppSurfacePosition", (appId?: string, x?: number, y?: number, flowUri?: FlowUriArgument) =>
      updateAppSurfacePosition(appId, x, y, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateProjectOverviewPosition", (x?: number, y?: number, flowUri?: FlowUriArgument) =>
      saveProjectOverviewPosition(x, y, flowUri)
    ),
    vscode.commands.registerCommand(
      "mindflow.createNodeAt",
      (x?: number, y?: number, appSurfaceIds?: string[], domainIds?: string[], roleIds?: string[], flowUri?: FlowUriArgument) =>
        createNodeAt(context, x, y, appSurfaceIds, domainIds, roleIds, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateNodeDetails", (nodeId?: string, patch?: UpdateNodeDetailsInput, flowUri?: FlowUriArgument) =>
      updateNodeDetails(context, nodeId, patch, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateProjectOverview", (patch?: UpdateProjectOverviewInput, flowUri?: FlowUriArgument) =>
      updateProjectOverviewDetails(context, patch, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.createEdge", (from?: FlowEndpoint, to?: FlowEndpoint, trigger?: string, type?: EdgeType, flowUri?: FlowUriArgument) =>
      createEdge(context, from, to, trigger, type, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.createConnectedNodeAt", (request?: CreateConnectedNodeRequest, flowUri?: FlowUriArgument) =>
      createConnectedNodeAt(context, request, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.removeNode", (nodeId?: string, flowUri?: FlowUriArgument) => deleteNode(context, nodeId, flowUri)),
    vscode.commands.registerCommand("mindflow.updateEdgeDetails", (edgeId?: string, patch?: UpdateEdgeDetailsInput, flowUri?: FlowUriArgument) =>
      updateEdgeDetails(context, edgeId, patch, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.removeEdge", (edgeId?: string, flowUri?: FlowUriArgument) => disconnectEdge(context, edgeId, flowUri)),
    vscode.commands.registerCommand("mindflow.updateTaxonomy", (request?: TaxonomyRequest, flowUri?: FlowUriArgument) => updateTaxonomy(context, request, flowUri))
  ];
}

async function newFlow(): Promise<void> {
  try {
    const flow = createEmptyProductFlow();
    const document = await vscode.workspace.openTextDocument(createUntitledMindFlowDocumentOptions(flow));
    rememberUntitledFlow(document.uri);
    await vscode.commands.executeCommand("vscode.openWith", document.uri, FlowPanel.viewType);
  } catch (error) {
    showError("Create blank MindFlow failed", error);
  }
}

async function saveFlowAs(
  context: vscode.ExtensionContext,
  sidebarView: SidebarView | undefined,
  sourceUri?: FlowUriArgument
): Promise<void> {
  try {
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    const targetUri = await vscode.window.showSaveDialog({
      title: "Save MindFlow",
      defaultUri: getDefaultSaveUri(flow, flowUri),
      filters: {
        "MindFlow": ["mindflow"],
        "All Files": ["*"]
      }
    });
    if (!targetUri) {
      return;
    }
    const targetPath = ensureMindFlowExtension(targetUri.fsPath);
    await new FlowRepository(path.dirname(targetPath)).saveToPath(targetPath, flow);
    await rememberRecentFlow(context, sidebarView, targetPath);
    FlowPanel.createOrShow(context.extensionUri, flow, vscode.Uri.file(targetPath));
  } catch (error) {
    showError("Save MindFlow failed", error);
  }
}

async function openFlow(context: vscode.ExtensionContext, sidebarView: SidebarView | undefined, flowPath?: string): Promise<void> {
  try {
    const resolvedPath = flowPath ? resolveInputFlowPath(flowPath) : (await pickMindFlowFile());
    if (!resolvedPath) {
      return;
    }
    const flow = await loadMindFlowFile(resolvedPath);
    await rememberRecentFlow(context, sidebarView, resolvedPath);
    FlowPanel.createOrShow(context.extensionUri, flow, vscode.Uri.file(resolvedPath));
  } catch (error) {
    showError("Open flow failed", error);
  }
}

async function validateFlowJson(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow, flowUri } = await loadCurrentFlow();
    const validation = validateProductFlow(flow);
    if (validation.valid) {
      vscode.window.showInformationMessage(`ProductFlow is valid: ${flowDisplayName(flowUri)}${validation.warnings.length ? ` (${validation.warnings.length} warning(s))` : ""}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument({
      content: validation.errors.join("\n"),
      language: "plaintext"
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
  } catch (error) {
    showError("Validate ProductFlow failed", error);
  }
}

async function updateNodePosition(nodeId?: string, x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!nodeId || typeof x !== "number" || typeof y !== "number") {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateManualNodePosition(flow, nodeId, x, y);
    await applyFlowDocumentEdit(flowUri, flow);
    return true;
  } catch (error) {
    showError("Update node position failed", error);
    return false;
  }
}

async function updateAppSurfacePosition(appId?: string, x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!appId || typeof x !== "number" || typeof y !== "number") {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateManualAppSurfacePosition(flow, appId, x, y);
    await applyFlowDocumentEdit(flowUri, flow);
    return true;
  } catch (error) {
    showError("Update app surface position failed", error);
    return false;
  }
}

async function saveProjectOverviewPosition(x?: number, y?: number, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (typeof x !== "number" || typeof y !== "number") {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    updateProjectOverviewPosition(flow, x, y);
    await applyFlowDocumentEdit(flowUri, flow);
    return true;
  } catch (error) {
    showError("Update project overview position failed", error);
    return false;
  }
}

async function createNodeAt(
  context: vscode.ExtensionContext,
  x?: number,
  y?: number,
  appSurfaceIds?: string[],
  domainIds?: string[],
  roleIds?: string[],
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  try {
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

async function updateNodeDetails(context: vscode.ExtensionContext, nodeId?: string, patch?: UpdateNodeDetailsInput, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!nodeId || !patch) {
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

async function updateProjectOverviewDetails(context: vscode.ExtensionContext, patch?: UpdateProjectOverviewInput, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!patch) {
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

async function createEdge(
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

interface CreateConnectedNodeRequest {
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

async function createConnectedNodeAt(context: vscode.ExtensionContext, request?: CreateConnectedNodeRequest, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!request || (!request.from && !request.to)) {
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

async function deleteNode(context: vscode.ExtensionContext, nodeId?: string, sourceUri?: FlowUriArgument): Promise<boolean> {
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

async function updateEdgeDetails(context: vscode.ExtensionContext, edgeId?: string, patch?: UpdateEdgeDetailsInput, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!edgeId || !patch) {
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

async function disconnectEdge(context: vscode.ExtensionContext, edgeId?: string, sourceUri?: FlowUriArgument): Promise<boolean> {
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

async function updateTaxonomy(context: vscode.ExtensionContext, request?: TaxonomyRequest, sourceUri?: FlowUriArgument): Promise<boolean> {
  try {
    if (!request) {
      return false;
    }
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    applyTaxonomyRequest(flow, request);
    await applyFlowDocumentEdit(flowUri, flow);
    if (request.action === "delete") {
      const selection = FlowPanel.getSelection(flowUri);
      if (request.kind === "appSurface") {
        selection.selectedAppSurfaceId = undefined;
      } else if (request.kind === "domain") {
        selection.selectedDomainId = undefined;
      } else if (request.kind === "role") {
        selection.selectedRoleId = undefined;
      } else if (request.kind === "statusGroup") {
        selection.selectedStatusGroupId = undefined;
      }
      FlowPanel.setSelection(flowUri, selection);
    }
    FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
    return true;
  } catch (error) {
    showError("Update MindFlow metadata failed", error);
    return false;
  }
}
