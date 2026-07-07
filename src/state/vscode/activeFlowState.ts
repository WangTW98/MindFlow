import * as vscode from "vscode";
import { isRealMindFlowUri } from "../../vscode/documents/flowUri";

let currentFlowPath: string | undefined;
let currentFlowUri: vscode.Uri | undefined;

export function rememberUntitledFlow(flowUri: vscode.Uri): void {
  currentFlowPath = undefined;
  currentFlowUri = flowUri;
}

export function rememberCurrentFlowUri(flowUri: vscode.Uri): void {
  currentFlowUri = flowUri;
  currentFlowPath = isRealMindFlowUri(flowUri) ? flowUri.fsPath : undefined;
}

export function rememberFlowPath(flowPath: string): void {
  currentFlowPath = flowPath;
  currentFlowUri = vscode.Uri.file(flowPath);
}

export function getRememberedFlowUri(): vscode.Uri | undefined {
  return currentFlowUri;
}

export function getRememberedFlowPath(): string | undefined {
  return currentFlowPath;
}
