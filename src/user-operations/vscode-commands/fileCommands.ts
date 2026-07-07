import * as path from "node:path";
import * as vscode from "vscode";
import { createEmptyProductFlow } from "../../state/product-flow/factory";
import { createUntitledMindFlowDocumentOptions } from "../../vscode/documents/untitledMindFlowDocument";
import { validateProductFlow } from "../../state/product-flow";
import { FlowRepository } from "../../state/storage/flowRepository";
import { FlowPanel } from "../../vscode/webviews/canvas/FlowPanel";
import type { SidebarView } from "../../vscode/webviews/sidebar/SidebarView";
import { createUntitledMindFlowUri, ensureMindFlowExtension, flowDisplayName, getDefaultSaveUri, loadCurrentFlow, loadMindFlowFile, pickMindFlowFile, rememberRecentFlow, rememberUntitledFlow, resolveInputFlowPath, showError, type FlowUriArgument } from "../../vscode/flowContext";

export async function newFlow(): Promise<void> {
  try {
    const flow = createEmptyProductFlow();
    const options = createUntitledMindFlowDocumentOptions(flow);
    const untitledUri = createUntitledMindFlowUri(flow);
    const document = untitledUri
      ? await vscode.workspace.openTextDocument(untitledUri)
      : await vscode.workspace.openTextDocument(options);
    if (untitledUri && !document.getText()) {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(0, 0), options.content);
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        throw new Error("VSCode refused to initialize the MindFlow document.");
      }
    }
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
