import * as path from "node:path";
import * as vscode from "vscode";
import type { ProductFlow } from "../models/productFlow";
import { parseProductFlowText, serializeProductFlow } from "../models/productFlowCodec";
import { assertValidProductFlowForSave } from "../models/productFlowSaveGuard";
import { pruneMissingAppSurfaceReferences } from "../core/taxonomyEditing";
import { createMindFlowFileName, createUntitledMindFlowTargetPath } from "../core/untitledMindFlowDocument";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../storage/flowRepository";
import { RecentFlowStore } from "../storage/recentFlows";
import { nowIso } from "../utils/id";

export type FlowUriArgument = vscode.Uri | string | undefined;

export interface RefreshableSidebar {
  refresh(): Promise<void>;
}

export interface FlowDocumentEditOptions {
  expectedRevision?: number;
}

export interface FlowDocumentEditResult<TResult> {
  flow: ProductFlow;
  flowUri: vscode.Uri;
  result: TResult;
}

let currentFlowPath: string | undefined;
let currentFlowUri: vscode.Uri | undefined;
const flowEditQueues = new Map<string, Promise<void>>();

export function rememberUntitledFlow(flowUri: vscode.Uri): void {
  currentFlowPath = undefined;
  currentFlowUri = flowUri;
}

export async function loadCurrentFlow(sourceUri?: FlowUriArgument): Promise<{ flow: ProductFlow; flowUri: vscode.Uri }> {
  const flowUri = await resolveCurrentFlowUri(sourceUri);
  const document = await vscode.workspace.openTextDocument(flowUri);
  const { flow } = parseProductFlowText(document.getText(), `ProductFlow document ${flowDisplayName(flowUri)}`);
  rememberCurrentFlowUri(document.uri);
  return { flow, flowUri: document.uri };
}

export async function editCurrentFlowDocument<TResult>(
  sourceUri: FlowUriArgument,
  edit: (flow: ProductFlow, flowUri: vscode.Uri) => TResult
): Promise<FlowDocumentEditResult<TResult>> {
  const flowUri = await resolveCurrentFlowUri(sourceUri);
  return enqueueFlowDocumentEdit(flowUri, async () => {
    const document = await vscode.workspace.openTextDocument(flowUri);
    const { flow } = parseProductFlowText(document.getText(), `ProductFlow document ${flowDisplayName(document.uri)}`);
    rememberCurrentFlowUri(document.uri);
    const result = edit(flow, document.uri);
    await applyFlowDocumentEditNow(document.uri, flow);
    return { flow, flowUri: document.uri, result };
  });
}

export async function applyFlowDocumentEdit(flowUri: vscode.Uri, flow: ProductFlow, options: FlowDocumentEditOptions = {}): Promise<void> {
  await enqueueFlowDocumentEdit(flowUri, () => applyFlowDocumentEditNow(flowUri, flow, options));
}

async function applyFlowDocumentEditNow(flowUri: vscode.Uri, flow: ProductFlow, options: FlowDocumentEditOptions = {}): Promise<void> {
  flow.updatedAt = nowIso();
  pruneMissingAppSurfaceReferences(flow);
  assertValidProductFlowForSave(flow);
  const document = await vscode.workspace.openTextDocument(flowUri);
  if (options.expectedRevision !== undefined) {
    const { flow: currentFlow } = parseProductFlowText(document.getText(), `ProductFlow document ${flowDisplayName(document.uri)}`);
    if (currentFlow.revision !== options.expectedRevision) {
      throw new Error(`ProductFlow document changed before edit was applied. Expected revision ${options.expectedRevision}, found ${currentFlow.revision}. Retry the operation with the latest editor state.`);
    }
  }
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, serializeProductFlow(flow));
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("VSCode refused the ProductFlow document edit.");
  }
}


export async function pickMindFlowFile(): Promise<string | undefined> {
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

export async function loadMindFlowFile(flowPath: string): Promise<ProductFlow> {
  return new FlowRepository(path.dirname(flowPath)).load(flowPath);
}

export function resolveInputFlowPath(flowPath: string): string {
  if (path.isAbsolute(flowPath)) {
    return flowPath;
  }
  const workspaceRoot = getWorkspaceRootIfAvailable();
  return path.join(workspaceRoot ?? process.cwd(), flowPath);
}

export function getDefaultSaveUri(flow: ProductFlow, flowUri: vscode.Uri): vscode.Uri | undefined {
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

export function createUntitledMindFlowUri(flow: ProductFlow): vscode.Uri | undefined {
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  const targetPath = createUntitledMindFlowTargetPath(flow, getWorkspaceRootIfAvailable(), flowDirectory);
  return targetPath ? vscode.Uri.file(targetPath).with({ scheme: "untitled" }) : undefined;
}

export function ensureMindFlowExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === FLOW_FILE_EXTENSION ? filePath : `${filePath}${FLOW_FILE_EXTENSION}`;
}

export async function rememberRecentFlow(
  context: vscode.ExtensionContext,
  sidebarView: RefreshableSidebar | undefined,
  flowPath: string
): Promise<void> {
  currentFlowPath = flowPath;
  currentFlowUri = vscode.Uri.file(flowPath);
  await new RecentFlowStore(context.globalState).add(flowPath);
  void sidebarView?.refresh();
}

export function isMindFlowDocument(document: vscode.TextDocument): boolean {
  return isRealMindFlowUri(document.uri) && path.extname(document.uri.fsPath) === ".mindflow";
}

export function isRealMindFlowUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && Boolean(uri.fsPath && path.isAbsolute(uri.fsPath));
}

export function rememberCurrentFlowUri(flowUri: vscode.Uri): void {
  currentFlowUri = flowUri;
  currentFlowPath = isRealMindFlowUri(flowUri) ? flowUri.fsPath : undefined;
}

export function flowDisplayName(flowUri: vscode.Uri): string {
  return path.basename(flowUri.fsPath) || "Untitled MindFlow";
}

export function createFlowRepository(): FlowRepository {
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  return new FlowRepository(getWorkspaceRoot(), flowDirectory);
}

export function getWorkspaceRootIfAvailable(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getWorkspaceRoot(): string {
  const workspaceRoot = getWorkspaceRootIfAvailable();
  if (!workspaceRoot) {
    throw new Error("MindFlow requires an open workspace folder.");
  }
  return workspaceRoot;
}

export function showError(prefix: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`${prefix}: ${message}`);
}

async function chooseOrLatestFlowUri(): Promise<vscode.Uri | undefined> {
  const repository = createFlowRepository();
  const flowPath = await chooseOrLatestFlow(repository);
  return flowPath ? vscode.Uri.file(flowPath) : undefined;
}

async function resolveCurrentFlowUri(sourceUri?: FlowUriArgument): Promise<vscode.Uri> {
  const requestedUri = normalizeFlowUri(sourceUri);
  const flowUri = requestedUri ?? getActiveMindFlowUri() ?? currentFlowUri ?? (currentFlowPath ? vscode.Uri.file(currentFlowPath) : undefined) ?? (await chooseOrLatestFlowUri());
  if (!flowUri) {
    throw new Error("No MindFlow file exists. Create or open a MindFlow file first.");
  }
  return flowUri;
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

function getWorkspaceMindFlowDirectoryUri(): vscode.Uri | undefined {
  const workspaceRoot = getWorkspaceRootIfAvailable();
  if (!workspaceRoot) {
    return undefined;
  }
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  return vscode.Uri.file(path.join(workspaceRoot, flowDirectory));
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

function enqueueFlowDocumentEdit<TResult>(flowUri: vscode.Uri, task: () => Promise<TResult>): Promise<TResult> {
  const key = flowUri.toString();
  const previous = flowEditQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const queued = run.then(() => undefined, () => undefined);
  flowEditQueues.set(key, queued);
  void queued.then(() => {
    if (flowEditQueues.get(key) === queued) {
      flowEditQueues.delete(key);
    }
  });
  return run;
}
