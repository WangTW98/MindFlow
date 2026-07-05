import * as path from "node:path";
import * as vscode from "vscode";
import type { ProductFlow } from "../models/productFlow";
import type { FlowSelectionState } from "./flowSelection";

export function createFlowWebviewState(flow: ProductFlow, document: vscode.TextDocument, selection: FlowSelectionState): unknown {
  return {
    flow,
    flowPath: vscode.workspace.asRelativePath(document.uri, false),
    flowFileName: path.basename(document.uri.fsPath),
    selectedProjectOverview: selection.selectedProjectOverview,
    selectedNodeId: selection.selectedNodeId ?? null,
    selectedEdgeId: selection.selectedEdgeId ?? null,
    selectedAppSurfaceId: selection.selectedAppSurfaceId ?? null,
    selectedDomainId: selection.selectedDomainId ?? null,
    selectedRoleId: selection.selectedRoleId ?? null,
    selectedStatusGroupId: selection.selectedStatusGroupId ?? null
  };
}
