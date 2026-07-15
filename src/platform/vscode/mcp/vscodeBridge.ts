import * as path from "node:path";
import * as vscode from "vscode";
import type { FlowSelectionPatch } from "../../../product-flow/domain/selection";
import type { ProductFlow } from "../../../product-flow/domain";
import { createEmptyProductFlow } from "../../../product-flow/domain/model/factory";
import { parseProductFlowText } from "../../../product-flow/domain/serialization/codec";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../../mcp/protocol/bridge";
import { applyFlowDocumentEdit } from "../documents/flowDocumentService";
import { flowDisplayName, normalizeFlowUri, resolveInputFlowPath } from "../documents/flowUri";
import { createUntitledMindFlowDocumentOptions } from "../documents/untitledMindFlowDocument";
import { loadMindFlowFile } from "../documents/flowDocumentService";
import { rememberUntitledFlow } from "../state/activeFlowState";
import { FlowPanel } from "../editor/canvas/FlowPanel";

export class VsCodeMindFlowEditorBridge implements MindFlowEditorBridge {
  public constructor(private readonly extensionUri: vscode.Uri) {}

  public async createFlow(title?: string): Promise<MindFlowEditorSnapshot> {
    const flow = createEmptyProductFlow(title?.trim() || undefined);
    const document = await vscode.workspace.openTextDocument(createUntitledMindFlowDocumentOptions(flow));
    rememberUntitledFlow(document.uri);
    await vscode.commands.executeCommand("vscode.openWith", document.uri, FlowPanel.viewType);
    return this.readSnapshot(document.uri, true);
  }

  public async openFlow(flowPath: string): Promise<MindFlowEditorSnapshot> {
    const resolvedPath = resolveInputFlowPath(flowPath);
    const flow = await loadMindFlowFile(resolvedPath);
    const uri = vscode.Uri.file(resolvedPath);
    FlowPanel.createOrShow(this.extensionUri, flow, uri);
    return this.readSnapshot(uri, true);
  }

  public async getOpenEditors(): Promise<MindFlowEditorSnapshot[]> {
    return Promise.all(FlowPanel.getOpenEditorSessions().map((session) => this.readSnapshot(session.uri, session.active)));
  }

  public async getActiveEditor(flowUri?: string): Promise<MindFlowEditorSnapshot> {
    if (flowUri) {
      return this.readSnapshot(requireOpenFlowUri(flowUri), false);
    }
    const openEditors = FlowPanel.getOpenEditorSessions();
    const activeUri = FlowPanel.getActiveFlowUri() ?? openEditors.find((session) => session.active)?.uri ?? openEditors[0]?.uri;
    if (!activeUri) {
      throw new Error("No active MindFlow editor. Open a .mindflow file in the MindFlow editor first.");
    }
    return this.readSnapshot(activeUri, true);
  }

  public async setSelection(flowUri: string, selection: FlowSelectionPatch): Promise<MindFlowEditorSnapshot> {
    const uri = requireOpenFlowUri(flowUri);
    FlowPanel.setSelection(uri, selection);
    return this.readSnapshot(uri, true);
  }

  public async applyFlowEdit(flowUri: string, flow: ProductFlow, selection?: FlowSelectionPatch, expectedRevision?: number): Promise<MindFlowEditorSnapshot> {
    const uri = requireOpenFlowUri(flowUri);
    if (selection) {
      FlowPanel.setSelection(uri, selection);
    }
    await applyFlowDocumentEdit(uri, flow, { expectedRevision });
    FlowPanel.createOrShow(this.extensionUri, flow, uri);
    return this.readSnapshot(uri, true);
  }

  private async readSnapshot(uri: vscode.Uri, active: boolean): Promise<MindFlowEditorSnapshot> {
    if (!FlowPanel.hasOpenEditor(uri)) {
      throw new Error(`MindFlow MCP can only access an open MindFlow editor: ${uri.toString()}`);
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const { flow } = parseProductFlowText(document.getText(), `ProductFlow document ${flowDisplayName(document.uri)}`);
    return {
      uri: document.uri.toString(),
      path: document.uri.scheme === "file" ? document.uri.fsPath : document.uri.toString(),
      displayName: path.basename(document.uri.fsPath) || flowDisplayName(document.uri),
      active,
      dirty: document.isDirty === true,
      flow,
      selection: FlowPanel.getSelection(document.uri)
    };
  }
}

function requireOpenFlowUri(flowUri: string): vscode.Uri {
  const uri = normalizeFlowUri(flowUri);
  if (!uri || !FlowPanel.hasOpenEditor(uri)) {
    throw new Error(`MindFlow MCP can only access an open MindFlow editor: ${flowUri}`);
  }
  return uri;
}
