import * as path from "node:path";
import * as vscode from "vscode";
import { createEmptyProductFlow } from "../../core/emptyFlow";
import { createUntitledMindFlowDocumentOptions } from "../../core/untitledMindFlowDocument";
import { validateProductFlow } from "../../models/productFlow";
import { FlowRepository } from "../../storage/flowRepository";
import { FlowPanel } from "../../webview/FlowPanel";
import type { SidebarView } from "../../webview/SidebarView";
import { ensureMindFlowExtension, flowDisplayName, getDefaultSaveUri, loadCurrentFlow, loadMindFlowFile, pickMindFlowFile, rememberRecentFlow, rememberUntitledFlow, resolveInputFlowPath, showError, type FlowUriArgument } from "../flowContext";

export async function newFlow(): Promise<void> {
  try {
    const flow = createEmptyProductFlow();
    const document = await vscode.workspace.openTextDocument(createUntitledMindFlowDocumentOptions(flow));
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
