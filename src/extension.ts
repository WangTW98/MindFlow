import * as path from "node:path";
import * as vscode from "vscode";
import type {
  EdgeType,
  FlowEndpoint,
  ProductFlow
} from "./models/productFlow";
import { validateProductFlow } from "./models/productFlow";
import {
  createManualEdge,
  createManualNode,
  removeManualNode,
  removeManualEdge,
  updateManualAppSurfacePosition,
  updateManualEdgeDetails,
  updateManualNodeDetails,
  updateManualNodePosition,
  type UpdateEdgeDetailsInput,
  type UpdateNodeDetailsInput
} from "./core/flowEditing";
import { createEmptyProductFlow } from "./core/emptyFlow";
import { applyTaxonomyRequest, type TaxonomyRequest } from "./core/taxonomy";
import { pruneMissingAppSurfaceReferences } from "./core/taxonomyEditing";
import { createUntitledMindFlowDocumentOptions } from "./core/untitledMindFlowDocument";
import { FlowRepository } from "./storage/flowRepository";
import { RecentFlowStore } from "./storage/recentFlows";
import { nowIso } from "./utils/id";
import { FlowPanel } from "./webview/FlowPanel";
import { SidebarView } from "./webview/SidebarView";

let currentFlowPath: string | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const sidebarView = new SidebarView(context, getWorkspaceRoot);
  context.subscriptions.push(
    FlowPanel.register(context, (flowUri) => {
      if (isRealMindFlowUri(flowUri)) {
        void rememberRecentFlow(context, sidebarView, flowUri.fsPath);
      }
    }),
    vscode.window.registerWebviewViewProvider(SidebarView.viewId, sidebarView)
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isMindFlowDocument(document)) {
        void rememberRecentFlow(context, sidebarView, document.uri.fsPath);
      }
    }),
    vscode.commands.registerCommand("mindflow.newFlow", () => newFlow()),
    vscode.commands.registerCommand("mindflow.openFlow", (flowPath?: string) => openFlow(context, sidebarView, flowPath)),
    vscode.commands.registerCommand("mindflow.validateFlowJson", () => validateFlowJson(context)),
    vscode.commands.registerCommand("mindflow.updateNodePosition", (nodeId?: string, x?: number, y?: number) =>
      updateNodePosition(nodeId, x, y)
    ),
    vscode.commands.registerCommand("mindflow.updateAppSurfacePosition", (appId?: string, x?: number, y?: number) =>
      updateAppSurfacePosition(appId, x, y)
    ),
    vscode.commands.registerCommand("mindflow.updateLayoutPositions", (request?: LayoutPositionsRequest) =>
      updateLayoutPositions(request)
    ),
    vscode.commands.registerCommand(
      "mindflow.createNodeAt",
      (x?: number, y?: number, appSurfaceIds?: string[], domainIds?: string[], roleIds?: string[]) =>
        createNodeAt(context, x, y, appSurfaceIds, domainIds, roleIds)
    ),
    vscode.commands.registerCommand("mindflow.updateNodeDetails", (nodeId?: string, patch?: UpdateNodeDetailsInput) =>
      updateNodeDetails(context, nodeId, patch)
    ),
    vscode.commands.registerCommand("mindflow.createEdge", (from?: FlowEndpoint, to?: FlowEndpoint, trigger?: string, type?: EdgeType) =>
      createEdge(context, from, to, trigger, type)
    ),
    vscode.commands.registerCommand("mindflow.createConnectedNodeAt", (request?: CreateConnectedNodeRequest) =>
      createConnectedNodeAt(context, request)
    ),
    vscode.commands.registerCommand("mindflow.removeNode", (nodeId?: string) => deleteNode(context, nodeId)),
    vscode.commands.registerCommand("mindflow.updateEdgeDetails", (edgeId?: string, patch?: UpdateEdgeDetailsInput) =>
      updateEdgeDetails(context, edgeId, patch)
    ),
    vscode.commands.registerCommand("mindflow.removeEdge", (edgeId?: string) => disconnectEdge(context, edgeId)),
    vscode.commands.registerCommand("mindflow.updateTaxonomy", (request?: TaxonomyRequest) => updateTaxonomy(context, request))
  );
}

export function deactivate(): void {
  // No background resources are held.
}

async function newFlow(): Promise<void> {
  try {
    const flow = createEmptyProductFlow();
    const document = await vscode.workspace.openTextDocument(createUntitledMindFlowDocumentOptions(flow));
    currentFlowPath = undefined;
    await vscode.commands.executeCommand("vscode.openWith", document.uri, FlowPanel.viewType);
  } catch (error) {
    showError("Create blank MindFlow failed", error);
  }
}

async function openFlow(context: vscode.ExtensionContext, sidebarView: SidebarView | undefined, flowPath?: string): Promise<void> {
  try {
    const repository = createFlowRepository();
    const resolvedPath = flowPath ?? (await pickMindFlowFile(repository));
    if (!resolvedPath) {
      return;
    }
    const flow = await repository.load(resolvedPath);
    await rememberRecentFlow(context, sidebarView, resolvedPath);
    FlowPanel.createOrShow(context.extensionUri, flow, resolvedPath);
  } catch (error) {
    showError("Open flow failed", error);
  }
}

async function validateFlowJson(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const validation = validateProductFlow(flow);
    if (validation.valid) {
      vscode.window.showInformationMessage(`ProductFlow is valid: ${path.basename(flowPath)}${validation.warnings.length ? ` (${validation.warnings.length} warning(s))` : ""}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument({
      content: validation.errors.join("\n"),
      language: "plaintext"
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Validate ProductFlow failed", error);
  }
}

async function updateNodePosition(nodeId?: string, x?: number, y?: number): Promise<void> {
  try {
    if (!nodeId || typeof x !== "number" || typeof y !== "number") {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualNodePosition(flow, nodeId, x, y);
    await applyFlowDocumentEdit(flowPath, flow);
  } catch (error) {
    showError("Update node position failed", error);
  }
}

async function updateAppSurfacePosition(appId?: string, x?: number, y?: number): Promise<void> {
  try {
    if (!appId || typeof x !== "number" || typeof y !== "number") {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualAppSurfacePosition(flow, appId, x, y);
    await applyFlowDocumentEdit(flowPath, flow);
  } catch (error) {
    showError("Update app surface position failed", error);
  }
}

interface LayoutNodePositionInput {
  nodeId?: string;
  x?: number;
  y?: number;
}

interface LayoutAppSurfacePositionInput {
  appId?: string;
  x?: number;
  y?: number;
}

interface LayoutPositionsRequest {
  nodes?: LayoutNodePositionInput[];
  appSurfaces?: LayoutAppSurfacePositionInput[];
}

async function updateLayoutPositions(request?: LayoutPositionsRequest): Promise<void> {
  try {
    const nodePositions = Array.isArray(request?.nodes) ? request.nodes : [];
    const appSurfacePositions = Array.isArray(request?.appSurfaces) ? request.appSurfaces : [];
    if (nodePositions.length === 0 && appSurfacePositions.length === 0) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    for (const item of nodePositions) {
      if (item.nodeId && typeof item.x === "number" && typeof item.y === "number") {
        updateManualNodePosition(flow, item.nodeId, item.x, item.y);
      }
    }
    for (const item of appSurfacePositions) {
      if (item.appId && typeof item.x === "number" && typeof item.y === "number") {
        updateManualAppSurfacePosition(flow, item.appId, item.x, item.y);
      }
    }
    await applyFlowDocumentEdit(flowPath, flow);
  } catch (error) {
    showError("Update layout positions failed", error);
  }
}

async function createNodeAt(
  context: vscode.ExtensionContext,
  x?: number,
  y?: number,
  appSurfaceIds?: string[],
  domainIds?: string[],
  roleIds?: string[]
): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const node = createManualNode(flow, {
      x,
      y,
      appSurfaceIds: Array.isArray(appSurfaceIds) ? appSurfaceIds : undefined,
      domainIds: Array.isArray(domainIds) ? domainIds : undefined,
      roleIds: Array.isArray(roleIds) ? roleIds : undefined
    });
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = node.nodeId;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Create node failed", error);
  }
}

async function updateNodeDetails(context: vscode.ExtensionContext, nodeId?: string, patch?: UpdateNodeDetailsInput): Promise<void> {
  try {
    if (!nodeId || !patch) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualNodeDetails(flow, nodeId, patch);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = nodeId;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Update node details failed", error);
  }
}

async function createEdge(
  context: vscode.ExtensionContext,
  from?: FlowEndpoint,
  to?: FlowEndpoint,
  trigger?: string,
  type?: EdgeType
): Promise<void> {
  try {
    if (!from || !to) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    const edge = createManualEdge(flow, { from, to, trigger, type });
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = undefined;
    FlowPanel.selectedEdgeId = edge.edgeId;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Create edge failed", error);
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

async function createConnectedNodeAt(context: vscode.ExtensionContext, request?: CreateConnectedNodeRequest): Promise<void> {
  try {
    if (!request || (!request.from && !request.to)) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
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
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = node.nodeId;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Create connected node failed", error);
  }
}

function nonEmptyArrayOr(value: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

async function deleteNode(context: vscode.ExtensionContext, nodeId?: string): Promise<void> {
  try {
    if (!nodeId) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    removeManualNode(flow, nodeId);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = undefined;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Delete node failed", error);
  }
}

async function updateEdgeDetails(context: vscode.ExtensionContext, edgeId?: string, patch?: UpdateEdgeDetailsInput): Promise<void> {
  try {
    if (!edgeId || !patch) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualEdgeDetails(flow, edgeId, patch);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = undefined;
    FlowPanel.selectedEdgeId = edgeId;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Update edge details failed", error);
  }
}

async function disconnectEdge(context: vscode.ExtensionContext, edgeId?: string): Promise<void> {
  try {
    if (!edgeId) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    removeManualEdge(flow, edgeId);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Disconnect edge failed", error);
  }
}

async function updateTaxonomy(context: vscode.ExtensionContext, request?: TaxonomyRequest): Promise<void> {
  try {
    if (!request) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    applyTaxonomyRequest(flow, request);
    await applyFlowDocumentEdit(flowPath, flow);
    if (request.action === "delete") {
      if (request.kind === "appSurface") {
        FlowPanel.selectedAppSurfaceId = undefined;
      } else if (request.kind === "domain") {
        FlowPanel.selectedDomainId = undefined;
      } else if (request.kind === "role") {
        FlowPanel.selectedRoleId = undefined;
      }
    }
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
  } catch (error) {
    showError("Update MindFlow metadata failed", error);
  }
}

async function loadCurrentFlow(): Promise<{ flow: ProductFlow; flowPath: string }> {
  const repository = createFlowRepository();
  const flowPath = currentFlowPath ?? (await chooseOrLatestFlow(repository));
  if (!flowPath) {
    throw new Error("No MindFlow file exists. Create or open a MindFlow file first.");
  }
  const document = await vscode.workspace.openTextDocument(flowPath);
  const parsed = JSON.parse(document.getText()) as unknown;
  const validation = validateProductFlow(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid ProductFlow document ${flowPath}:\n${validation.errors.join("\n")}`);
  }
  const flow = parsed as ProductFlow;
  currentFlowPath = flowPath;
  return { flow, flowPath };
}

async function applyFlowDocumentEdit(flowPath: string, flow: ProductFlow): Promise<void> {
  flow.updatedAt = nowIso();
  pruneMissingAppSurfaceReferences(flow);
  const validation = validateProductFlow(flow);
  if (!validation.valid) {
    throw new Error(`Cannot apply invalid ProductFlow:\n${validation.errors.join("\n")}`);
  }
  const document = await vscode.workspace.openTextDocument(flowPath);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, `${JSON.stringify(flow, null, 2)}\n`);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("VSCode refused the ProductFlow document edit.");
  }
}

async function chooseOrLatestFlow(repository: FlowRepository): Promise<string | undefined> {
  const files = await repository.list();
  if (files.length === 0) {
    return undefined;
  }
  if (files.length === 1) {
    return files[0];
  }
  const latest = await repository.latest();
  const selected = await vscode.window.showQuickPick(
    files.map((file) => ({
      label: path.basename(file),
      description: file === latest ? "latest" : repository.relativePath(file),
      file
    })),
    { title: "Select MindFlow file" }
  );
  return selected?.file ?? latest;
}

async function pickMindFlowFile(repository: FlowRepository): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: "Open MindFlow",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(repository.directoryPath),
    filters: {
      "MindFlow": ["mindflow"],
      "All Files": ["*"]
    }
  });
  return picked?.[0]?.fsPath;
}

async function rememberRecentFlow(
  context: vscode.ExtensionContext,
  sidebarView: SidebarView | undefined,
  flowPath: string
): Promise<void> {
  currentFlowPath = flowPath;
  await new RecentFlowStore(context.workspaceState).add(flowPath);
  void sidebarView?.refresh();
}

function isMindFlowDocument(document: vscode.TextDocument): boolean {
  return isRealMindFlowUri(document.uri) && path.extname(document.uri.fsPath) === ".mindflow";
}

function isRealMindFlowUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && Boolean(uri.fsPath && path.isAbsolute(uri.fsPath));
}

function createFlowRepository(): FlowRepository {
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  return new FlowRepository(getWorkspaceRoot(), flowDirectory);
}

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error("MindFlow requires an open workspace folder.");
  }
  return folder.uri.fsPath;
}

function showError(prefix: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`${prefix}: ${message}`);
}
