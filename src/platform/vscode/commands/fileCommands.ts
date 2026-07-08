import * as path from "node:path";
import * as vscode from "vscode";
import { createEmptyProductFlow } from "../../../product-flow/domain/model/factory";
import { createUntitledMindFlowDocumentOptions } from "../documents/untitledMindFlowDocument";
import { validateProductFlow } from "../../../product-flow/domain";
import { FlowRepository } from "../../../product-flow/infrastructure/persistence/flowRepository";
import { FlowPanel } from "../editor/canvas/FlowPanel";
import type { SidebarView } from "../sidebar/SidebarView";
import { loadCurrentFlow, loadMindFlowFile, pickMindFlowFile, showError } from "../documents/flowDocumentService";
import { ensureMindFlowExtension, flowDisplayName, getDefaultSaveUri, resolveInputFlowPath, type FlowUriArgument } from "../documents/flowUri";
import { rememberUntitledFlow } from "../state/activeFlowState";
import { rememberRecentFlow } from "../state/recentFlowState";

export async function newFlow(): Promise<void> {
  try {
    const flow = createEmptyProductFlow();
    const options = createUntitledMindFlowDocumentOptions(flow);
    const document = await vscode.workspace.openTextDocument(options);
    rememberUntitledFlow(document.uri);
    await vscode.commands.executeCommand("vscode.openWith", document.uri, FlowPanel.viewType);
  } catch (error) {
    showError("Create blank MindFlow failed", error);
  }
}

export async function saveFlowAs(
  context: vscode.ExtensionContext,
  sidebarView: SidebarView | undefined,
  sourceUri?: FlowUriArgument
): Promise<void> {
  try {
    const { flow, flowUri } = await loadCurrentFlow(sourceUri);
    if (flowUri.scheme === "untitled") {
      FlowPanel.createOrShow(context.extensionUri, flow, flowUri);
      await vscode.commands.executeCommand("workbench.action.files.saveAs");
      return;
    }
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

export async function openFlow(context: vscode.ExtensionContext, sidebarView: SidebarView | undefined, flowPath?: string): Promise<void> {
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

export async function validateFlowJson(context: vscode.ExtensionContext): Promise<void> {
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
