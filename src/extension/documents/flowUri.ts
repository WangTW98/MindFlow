import * as path from "node:path";
import * as vscode from "vscode";
import { createMindFlowFileName, createUntitledMindFlowTargetPath } from "../../domain/product-flow/fileNaming";
import type { ProductFlow } from "../../domain/product-flow";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../../storage/flowRepository";

export type FlowUriArgument = vscode.Uri | string | undefined;

export function isMindFlowDocument(document: vscode.TextDocument): boolean {
  return isRealMindFlowUri(document.uri) && path.extname(document.uri.fsPath) === ".mindflow";
}

export function isRealMindFlowUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && Boolean(uri.fsPath && path.isAbsolute(uri.fsPath));
}

export function normalizeFlowUri(flowUri: FlowUriArgument): vscode.Uri | undefined {
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

export function flowDisplayName(flowUri: vscode.Uri): string {
  return path.basename(flowUri.fsPath) || "Untitled MindFlow";
}

export function ensureMindFlowExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === FLOW_FILE_EXTENSION ? filePath : `${filePath}${FLOW_FILE_EXTENSION}`;
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
  const flowDirectory = getConfiguredFlowDirectory();
  return vscode.Uri.file(path.join(workspaceRoot, flowDirectory, createMindFlowFileName(flow)));
}

export function createUntitledMindFlowUri(flow: ProductFlow): vscode.Uri | undefined {
  const targetPath = createUntitledMindFlowTargetPath(flow, getWorkspaceRootIfAvailable(), getConfiguredFlowDirectory());
  return targetPath ? vscode.Uri.file(targetPath).with({ scheme: "untitled" }) : undefined;
}

export function createFlowRepository(): FlowRepository {
  return new FlowRepository(getWorkspaceRoot(), getConfiguredFlowDirectory());
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

export function getWorkspaceMindFlowDirectoryUri(): vscode.Uri | undefined {
  const workspaceRoot = getWorkspaceRootIfAvailable();
  if (!workspaceRoot) {
    return undefined;
  }
  return vscode.Uri.file(path.join(workspaceRoot, getConfiguredFlowDirectory()));
}

function getConfiguredFlowDirectory(): string {
  return vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
}
