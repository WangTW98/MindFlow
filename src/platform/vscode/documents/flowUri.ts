import * as path from "node:path";
import * as vscode from "vscode";
import { createMindFlowFileName } from "../../../product-flow/domain/model/fileNaming";
import type { ProductFlow } from "../../../product-flow/domain";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../../../product-flow/infrastructure/persistence/flowRepository";
import { assertAbsoluteLocalMindFlowPath } from "../../../shared/localMindFlowPath";
import { isPathInsideWorkspace, normalizeWorkspaceRelativeDirectory } from "./workspacePathPolicy";

export type FlowUriArgument = vscode.Uri | string | undefined;

export function isMindFlowDocument(document: vscode.TextDocument): boolean {
  return isRealMindFlowUri(document.uri) && path.extname(document.uri.fsPath).toLowerCase() === FLOW_FILE_EXTENSION;
}

export function isRealMindFlowUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && Boolean(uri.fsPath && path.isAbsolute(uri.fsPath));
}

export function normalizeFlowUri(flowUri: FlowUriArgument): vscode.Uri | undefined {
  if (!flowUri) {
    return undefined;
  }
  const uri = typeof flowUri === "string" ? uriFromString(flowUri) : flowUri;
  if (uri.scheme === "untitled") {
    return uri;
  }
  return assertLocalMindFlowUri(uri);
}

export function assertLocalMindFlowUri(uri: vscode.Uri): vscode.Uri {
  if (!isRealMindFlowUri(uri)) {
    throw new Error("MindFlow only supports local absolute file URIs.");
  }
  if (path.extname(uri.fsPath).toLowerCase() !== FLOW_FILE_EXTENSION) {
    throw new Error(`MindFlow file must use the ${FLOW_FILE_EXTENSION} extension.`);
  }
  return uri;
}

export function flowDisplayName(flowUri: vscode.Uri): string {
  return path.basename(flowUri.fsPath) || "Untitled MindFlow";
}

export function ensureMindFlowExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === FLOW_FILE_EXTENSION ? filePath : `${filePath}${FLOW_FILE_EXTENSION}`;
}

export function resolveInputFlowPath(flowPath: string): string {
  return assertLocalMindFlowUri(vscode.Uri.file(assertAbsoluteLocalMindFlowPath(flowPath))).fsPath;
}

export function getDefaultSaveUri(flow: ProductFlow, flowUri: vscode.Uri): vscode.Uri | undefined {
  if (isRealMindFlowUri(flowUri)) {
    return assertLocalMindFlowUri(vscode.Uri.file(ensureMindFlowExtension(flowUri.fsPath)));
  }
  const folder = preferredWorkspaceFolder();
  if (!folder) {
    return undefined;
  }
  const flowDirectory = getConfiguredFlowDirectory(folder.uri);
  return vscode.Uri.file(path.join(folder.uri.fsPath, flowDirectory, createMindFlowFileName(flow)));
}

export function createFlowRepository(resource?: vscode.Uri): FlowRepository | undefined {
  const folder = resource ? workspaceFolderForUri(resource) : preferredWorkspaceFolder();
  if (!folder) {
    return undefined;
  }
  return new FlowRepository(folder.uri.fsPath, getConfiguredFlowDirectory(folder.uri));
}

export function getWorkspaceRootIfAvailable(resource?: vscode.Uri): string | undefined {
  return (resource ? workspaceFolderForUri(resource) : preferredWorkspaceFolder())?.uri.fsPath;
}

export function getWorkspaceMindFlowDirectoryUri(resource?: vscode.Uri): vscode.Uri | undefined {
  const folder = resource ? workspaceFolderForUri(resource) : preferredWorkspaceFolder();
  if (!folder) {
    return undefined;
  }
  return vscode.Uri.file(path.join(folder.uri.fsPath, getConfiguredFlowDirectory(folder.uri)));
}

function uriFromString(value: string): vscode.Uri {
  if (path.isAbsolute(value)) {
    return vscode.Uri.file(value);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return vscode.Uri.parse(value);
  }
  throw new Error("MindFlow file path must be an absolute local path.");
}

function preferredWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  return (activeUri ? workspaceFolderForUri(activeUri) : undefined) ?? vscode.workspace.workspaceFolders?.[0];
}

function workspaceFolderForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder?.(uri) ?? vscode.workspace.workspaceFolders?.find((folder) => isPathInsideWorkspace(folder.uri.fsPath, uri.fsPath));
}

function getConfiguredFlowDirectory(resource: vscode.Uri): string {
  const configured = vscode.workspace.getConfiguration("mindflow.storage", resource).get<string>("flowDirectory", ".mindflow/flows");
  return normalizeWorkspaceRelativeDirectory(configured);
}
