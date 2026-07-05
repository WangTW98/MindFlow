import * as path from "node:path";
import * as vscode from "vscode";
import type {
  EdgeType,
  FlowEndpoint,
  ProductFlow
} from "./models/productFlow";
import { validateProductFlow } from "./models/productFlow";
import { parseProductFlowText, serializeProductFlow } from "./models/productFlowCodec";
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
import {
  updateProjectOverview,
  updateProjectOverviewPosition,
  type UpdateProjectOverviewInput
} from "./core/projectOverview";
import { applyTaxonomyRequest, type TaxonomyRequest } from "./core/taxonomy";
import { pruneMissingAppSurfaceReferences } from "./core/taxonomyEditing";
import { createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "./core/untitledMindFlowDocument";
import { FLOW_FILE_EXTENSION, FlowRepository } from "./storage/flowRepository";
import { RecentFlowStore } from "./storage/recentFlows";
import { nowIso, slugify } from "./utils/id";
import { FlowPanel } from "./webview/FlowPanel";
import { SidebarView } from "./webview/SidebarView";

type FlowUriArgument = vscode.Uri | string | undefined;

let currentFlowPath: string | undefined;
let currentFlowUri: vscode.Uri | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const sidebarView = new SidebarView(context, getWorkspaceRoot);
  context.subscriptions.push(
    FlowPanel.register(context, (flowUri) => {
      rememberCurrentFlowUri(flowUri);
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
    currentFlowUri = document.uri;
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

async function loadCurrentFlow(sourceUri?: FlowUriArgument): Promise<{ flow: ProductFlow; flowUri: vscode.Uri }> {
  const requestedUri = normalizeFlowUri(sourceUri);
  const flowUri = requestedUri ?? getActiveMindFlowUri() ?? currentFlowUri ?? (currentFlowPath ? vscode.Uri.file(currentFlowPath) : undefined) ?? (await chooseOrLatestFlowUri());
  if (!flowUri) {
    throw new Error("No MindFlow file exists. Create or open a MindFlow file first.");
  }
  const document = await vscode.workspace.openTextDocument(flowUri);
  const { flow } = parseProductFlowText(document.getText(), `ProductFlow document ${flowDisplayName(flowUri)}`);
  rememberCurrentFlowUri(document.uri);
  return { flow, flowUri: document.uri };
}

async function applyFlowDocumentEdit(flowUri: vscode.Uri, flow: ProductFlow): Promise<void> {
  flow.updatedAt = nowIso();
  pruneMissingAppSurfaceReferences(flow);
  const document = await vscode.workspace.openTextDocument(flowUri);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, serializeProductFlow(flow));
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("VSCode refused the ProductFlow document edit.");
  }
}

async function chooseOrLatestFlowUri(): Promise<vscode.Uri | undefined> {
  const repository = createFlowRepository();
  const flowPath = await chooseOrLatestFlow(repository);
  return flowPath ? vscode.Uri.file(flowPath) : undefined;
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

async function pickMindFlowFile(): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: "Open MindFlow",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: getWorkspaceMindFlowDirectoryUri(),
    filters: {
      "MindFlow": ["mindflow"],
      "All Files": ["*"]
    }
  });
  return picked?.[0]?.fsPath;
}

async function loadMindFlowFile(flowPath: string): Promise<ProductFlow> {
  return new FlowRepository(path.dirname(flowPath)).load(flowPath);
}

function resolveInputFlowPath(flowPath: string): string {
  if (path.isAbsolute(flowPath)) {
    return flowPath;
  }
  const workspaceRoot = getWorkspaceRootIfAvailable();
  return path.join(workspaceRoot ?? process.cwd(), flowPath);
}

function getWorkspaceMindFlowDirectoryUri(): vscode.Uri | undefined {
  const workspaceRoot = getWorkspaceRootIfAvailable();
  if (!workspaceRoot) {
    return undefined;
  }
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  return vscode.Uri.file(path.join(workspaceRoot, flowDirectory));
}

function getDefaultSaveUri(flow: ProductFlow, flowUri: vscode.Uri): vscode.Uri | undefined {
  if (isRealMindFlowUri(flowUri)) {
    return vscode.Uri.file(ensureMindFlowExtension(flowUri.fsPath));
  }
  const workspaceRoot = getWorkspaceRootIfAvailable();
  if (!workspaceRoot) {
    return undefined;
  }
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  return vscode.Uri.file(path.join(workspaceRoot, flowDirectory, createMindFlowFileName(flow)));
}

function createMindFlowFileName(flow: ProductFlow): string {
  if (flow.title === "Untitled MindFlow") {
    return createUntitledMindFlowFileName(flow);
  }
  return `${slugify(flow.title, "flow")}-${flow.flowId}${FLOW_FILE_EXTENSION}`;
}

function ensureMindFlowExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === FLOW_FILE_EXTENSION ? filePath : `${filePath}${FLOW_FILE_EXTENSION}`;
}

async function rememberRecentFlow(
  context: vscode.ExtensionContext,
  sidebarView: SidebarView | undefined,
  flowPath: string
): Promise<void> {
  currentFlowPath = flowPath;
  currentFlowUri = vscode.Uri.file(flowPath);
  await new RecentFlowStore(context.globalState).add(flowPath);
  void sidebarView?.refresh();
}

function isMindFlowDocument(document: vscode.TextDocument): boolean {
  return isRealMindFlowUri(document.uri) && path.extname(document.uri.fsPath) === ".mindflow";
}

function isRealMindFlowUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && Boolean(uri.fsPath && path.isAbsolute(uri.fsPath));
}

function rememberCurrentFlowUri(flowUri: vscode.Uri): void {
  currentFlowUri = flowUri;
  currentFlowPath = isRealMindFlowUri(flowUri) ? flowUri.fsPath : undefined;
}

function getActiveMindFlowUri(): vscode.Uri | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (!activeDocument) {
    return undefined;
  }
  if (isMindFlowDocument(activeDocument) || activeDocument.uri.toString() === currentFlowUri?.toString()) {
    return activeDocument.uri;
  }
  return undefined;
}

function normalizeFlowUri(flowUri: FlowUriArgument): vscode.Uri | undefined {
  if (!flowUri) {
    return undefined;
  }
  if (typeof flowUri !== "string") {
    return flowUri;
  }
  if (path.isAbsolute(flowUri)) {
    return vscode.Uri.file(flowUri);
  }
  return flowUri.includes(":") ? vscode.Uri.parse(flowUri) : vscode.Uri.file(flowUri);
}

function flowDisplayName(flowUri: vscode.Uri): string {
  return path.basename(flowUri.fsPath) || "Untitled MindFlow";
}

function createFlowRepository(): FlowRepository {
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  return new FlowRepository(getWorkspaceRoot(), flowDirectory);
}

function getWorkspaceRootIfAvailable(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getWorkspaceRoot(): string {
  const workspaceRoot = getWorkspaceRootIfAvailable();
  if (!workspaceRoot) {
    throw new Error("MindFlow requires an open workspace folder.");
  }
  return workspaceRoot;
}

function showError(prefix: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`${prefix}: ${message}`);
}
