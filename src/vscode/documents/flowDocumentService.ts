import * as path from "node:path";
import * as vscode from "vscode";
import { pruneMissingAppSurfaceReferences } from "../../state/operations";
import type { ProductFlow } from "../../state/product-flow";
import { parseProductFlowText, serializeProductFlow } from "../../state/product-flow/codec";
import { assertValidProductFlowForSave } from "../../state/product-flow/saveGuard";
import { FlowRepository } from "../../state/storage/flowRepository";
import { nowIso } from "../../state/id";
import { getRememberedFlowPath, getRememberedFlowUri, rememberCurrentFlowUri } from "../../state/vscode/activeFlowState";
import { enqueueFlowDocumentEdit } from "./flowEditQueue";
import {
  createFlowRepository,
  flowDisplayName,
  getWorkspaceMindFlowDirectoryUri,
  isMindFlowDocument,
  normalizeFlowUri,
  type FlowUriArgument
} from "./flowUri";

export interface FlowDocumentEditOptions {
  expectedRevision?: number;
}

export interface FlowDocumentEditResult<TResult> {
  flow: ProductFlow;
  flowUri: vscode.Uri;
  result: TResult;
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
  return enqueueFlowDocumentEdit(flowUri.toString(), async () => {
    const document = await vscode.workspace.openTextDocument(flowUri);
    const { flow } = parseProductFlowText(document.getText(), `ProductFlow document ${flowDisplayName(document.uri)}`);
    rememberCurrentFlowUri(document.uri);
    const result = edit(flow, document.uri);
    await applyFlowDocumentEditNow(document.uri, flow);
    return { flow, flowUri: document.uri, result };
  });
}

export async function applyFlowDocumentEdit(flowUri: vscode.Uri, flow: ProductFlow, options: FlowDocumentEditOptions = {}): Promise<void> {
  await enqueueFlowDocumentEdit(flowUri.toString(), () => applyFlowDocumentEditNow(flowUri, flow, options));
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

export function showError(prefix: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`${prefix}: ${message}`);
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

async function resolveCurrentFlowUri(sourceUri?: FlowUriArgument): Promise<vscode.Uri> {
  const requestedUri = normalizeFlowUri(sourceUri);
  const rememberedUri = getRememberedFlowUri();
  const rememberedPath = getRememberedFlowPath();
  const flowUri = requestedUri ?? getActiveMindFlowUri() ?? rememberedUri ?? (rememberedPath ? vscode.Uri.file(rememberedPath) : undefined) ?? (await chooseOrLatestFlowUri());
  if (!flowUri) {
    throw new Error("No MindFlow file exists. Create or open a MindFlow file first.");
  }
  return flowUri;
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

function getActiveMindFlowUri(): vscode.Uri | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  const rememberedUri = getRememberedFlowUri();
  if (!activeDocument) {
    return undefined;
  }
  if (isMindFlowDocument(activeDocument) || activeDocument.uri.toString() === rememberedUri?.toString()) {
    return activeDocument.uri;
  }
  return undefined;
}
