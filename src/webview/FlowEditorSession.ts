import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ProductFlow } from "../models/productFlow";
import { parseProductFlowText, serializeProductFlow, tryParseProductFlowText } from "../models/productFlowCodec";
import { chooseFresherFlow } from "./flowDocument";
import { recordEdgeDetailsRevision } from "./flowMessageOrdering";
import type { FlowSelectionPatch, FlowSelectionState } from "./flowSelection";
import {
  FLOW_WEBVIEW_SCRIPT_FILES,
  FLOW_WEBVIEW_STYLE_FILES,
  getNonce,
  renderFlowErrorHtml,
  renderFlowRestorePendingHtml,
  renderFlowWebviewHtml
} from "./flowWebviewHtml";
import { parseWebviewMessage, type WebviewMessage } from "./flowWebviewMessages";

export interface FlowEditorSelectionController {
  getSelection(flowUri: vscode.Uri | string): FlowSelectionState;
  setSelection(flowUri: vscode.Uri | string, selection: FlowSelectionPatch): void;
}

export class FlowEditorSession {
  private flow: ProductFlow | undefined;
  private messageQueue: Promise<void> = Promise.resolve();
  private readonly latestEdgeDetailsRevisions = new Map<string, number>();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly selectionController: FlowEditorSelectionController
  ) {
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      const parsed = parseWebviewMessage(message);
      if (!parsed) {
        console.warn("Ignored invalid MindFlow webview message", message);
        return;
      }
      this.enqueueMessage(parsed);
    });
  }

  public renderFromDocument(document: vscode.TextDocument): void {
    try {
      const text = this.getRenderableDocumentText(document);
      if (!text.trim()) {
        if (document.isUntitled) {
          this.renderRestorePending();
        } else {
          this.renderError("MindFlow file is empty. Save valid .mindflow JSON or create a new blank MindFlow.");
        }
        return;
      }
      const result = parseProductFlowText(text, "ProductFlow");
      this.flow = result.flow;
      if (result.migrated) {
        void this.replaceDocumentText(document, serializeProductFlow(this.flow));
      }
      this.renderFlow(this.flow);
    } catch (error) {
      this.renderError(error instanceof Error ? error.message : String(error));
    }
  }

  public renderWithFallback(fallbackFlow: ProductFlow): void {
    try {
      const documentFlow = tryParseProductFlowText(this.getRenderableDocumentText(this.document, fallbackFlow));
      this.flow = documentFlow ? chooseFresherFlow(documentFlow, fallbackFlow) : fallbackFlow;
      this.renderFlow(this.flow);
    } catch {
      this.flow = fallbackFlow;
      this.renderFlow(fallbackFlow);
    }
  }

  public reveal(): void {
    this.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One);
  }

  private getRenderableDocumentText(document: vscode.TextDocument, fallbackFlow?: ProductFlow): string {
    const documentText = document.getText();
    if (documentText.trim()) {
      return documentText;
    }

    const replacementText = this.createHydratedDocumentText(document, fallbackFlow);
    if (replacementText) {
      void this.replaceDocumentText(document, replacementText);
      return replacementText;
    }

    return documentText;
  }

  private createHydratedDocumentText(document: vscode.TextDocument, fallbackFlow?: ProductFlow): string | undefined {
    if (document.uri.scheme === "file" && document.uri.fsPath) {
      try {
        const diskText = fs.readFileSync(document.uri.fsPath, "utf8");
        if (diskText.trim()) {
          return diskText;
        }
      } catch {
        // Fall through to the normal validation error below.
      }
    }

    if (fallbackFlow) {
      return serializeProductFlow(fallbackFlow);
    }

    return undefined;
  }

  private async replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
    const applied = await replaceDocumentText(document, text);
    if (!applied) {
      this.renderError("VSCode refused to restore the MindFlow document content.");
    }
  }

  private enqueueMessage(message: WebviewMessage): void {
    const next = this.messageQueue.then(() => this.handleMessage(message));
    this.messageQueue = next.catch((error) => {
      console.error("MindFlow webview message failed", error);
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "selectNode":
        this.setSelection({ selectedProjectOverview: false, selectedNodeId: message.nodeId });
        break;
      case "selectEdge":
        this.setSelection({ selectedProjectOverview: false, selectedEdgeId: message.edgeId });
        break;
      case "selectAppSurface":
        this.setSelection({ selectedProjectOverview: false, selectedAppSurfaceId: message.appId });
        break;
      case "selectDomain":
        this.setSelection({ selectedProjectOverview: false, selectedDomainId: message.domainId });
        break;
      case "selectRole":
        this.setSelection({ selectedProjectOverview: false, selectedRoleId: message.roleId });
        break;
      case "selectStatusGroup":
        this.setSelection({ selectedProjectOverview: false, selectedStatusGroupId: message.statusGroupId });
        break;
      case "clearSelection":
        this.setSelection({});
        break;
      case "selectProjectOverview":
        this.setSelection({ selectedProjectOverview: true });
        break;
      case "deleteNode":
        this.setSelection({ selectedProjectOverview: false, selectedNodeId: message.nodeId });
        await this.executeMindFlowCommand("删除节点", "mindflow.removeNode", message.nodeId, this.document.uri);
        break;
      case "saveNodePosition":
        await this.executeMindFlowCommand("保存节点位置", "mindflow.updateNodePosition", message.nodeId, message.x, message.y, this.document.uri);
        break;
      case "saveAppSurfacePosition":
        await this.executeMindFlowCommand("保存应用端位置", "mindflow.updateAppSurfacePosition", message.appId, message.x, message.y, this.document.uri);
        break;
      case "saveProjectOverviewPosition":
        await this.executeMindFlowCommand("保存项目概述位置", "mindflow.updateProjectOverviewPosition", message.x, message.y, this.document.uri);
        break;
      case "createNodeAt":
        await this.executeMindFlowCommand(
          "创建节点",
          "mindflow.createNodeAt",
          message.x,
          message.y,
          message.appSurfaceIds,
          message.domainIds,
          message.roleIds,
          this.document.uri
        );
        break;
      case "updateNodeDetails":
        await this.executeMindFlowCommand("更新节点详情", "mindflow.updateNodeDetails", message.nodeId, message.patch, this.document.uri);
        break;
      case "updateProjectOverview":
        await this.executeMindFlowCommand("更新项目概述", "mindflow.updateProjectOverview", message.patch, this.document.uri);
        break;
      case "createEdge":
        await this.executeMindFlowCommand("创建连线", "mindflow.createEdge", message.from, message.to, message.trigger, message.edgeType, this.document.uri);
        break;
      case "createConnectedNodeAt":
        await this.executeMindFlowCommand("创建连接节点", "mindflow.createConnectedNodeAt", message.request, this.document.uri);
        break;
      case "updateEdgeDetails":
        if (!recordEdgeDetailsRevision(this.latestEdgeDetailsRevisions, message.edgeId, message.revision)) {
          return;
        }
        await this.executeMindFlowCommand("更新连线详情", "mindflow.updateEdgeDetails", message.edgeId, message.patch, this.document.uri);
        break;
      case "removeEdge":
        await this.executeMindFlowCommand("删除连线", "mindflow.removeEdge", message.edgeId, this.document.uri);
        break;
      case "updateTaxonomy":
        if (message.request.action === "delete") {
          const selection = this.selectionController.getSelection(this.document.uri);
          if (message.request.kind === "appSurface") {
            selection.selectedAppSurfaceId = undefined;
          } else if (message.request.kind === "domain") {
            selection.selectedDomainId = undefined;
          } else if (message.request.kind === "role") {
            selection.selectedRoleId = undefined;
          } else if (message.request.kind === "statusGroup") {
            selection.selectedStatusGroupId = undefined;
          }
          this.selectionController.setSelection(this.document.uri, selection);
        }
        await this.executeMindFlowCommand("更新元数据", "mindflow.updateTaxonomy", message.request, this.document.uri);
        break;
      default:
        break;
    }
  }

  private setSelection(selection: FlowSelectionPatch): void {
    this.selectionController.setSelection(this.document.uri, selection);
  }

  private async executeMindFlowCommand(label: string, command: string, ...args: unknown[]): Promise<void> {
    try {
      const ok = await vscode.commands.executeCommand<boolean | undefined>(command, ...args);
      if (ok === false) {
        this.postCommandResult(false, `${label}失败，文档未更新。`, true);
        return;
      }
      this.postCommandResult(true, "修改已写入 VS Code 文档缓冲区。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postCommandResult(false, `${label}失败：${message}`, true);
    }
  }

  private postCommandResult(ok: boolean, message: string, includeFlow = false): void {
    void this.panel.webview.postMessage({
      type: "commandResult",
      ok,
      message,
      ...(includeFlow && this.flow ? { flow: this.flow } : {})
    });
  }

  private renderFlow(flow: ProductFlow): void {
    const selection = this.selectionController.getSelection(this.document.uri);
    this.panel.webview.html = renderFlowWebviewHtml({
      cspSource: this.panel.webview.cspSource,
      nonce: getNonce(),
      styleUris: FLOW_WEBVIEW_STYLE_FILES.map((fileName) => this.mediaUri(fileName)),
      scriptUris: FLOW_WEBVIEW_SCRIPT_FILES.map((fileName) => this.mediaUri(fileName)),
      initialState: {
        flow,
        flowPath: vscode.workspace.asRelativePath(this.document.uri, false),
        flowFileName: path.basename(this.document.uri.fsPath),
        selectedProjectOverview: selection.selectedProjectOverview,
        selectedNodeId: selection.selectedNodeId ?? null,
        selectedEdgeId: selection.selectedEdgeId ?? null,
        selectedAppSurfaceId: selection.selectedAppSurfaceId ?? null,
        selectedDomainId: selection.selectedDomainId ?? null,
        selectedRoleId: selection.selectedRoleId ?? null,
        selectedStatusGroupId: selection.selectedStatusGroupId ?? null
      }
    });
  }

  private renderError(message: string): void {
    this.panel.webview.html = renderFlowErrorHtml(message, getNonce());
  }

  private renderRestorePending(): void {
    this.panel.webview.html = renderFlowRestorePendingHtml(getNonce());
  }

  private mediaUri(fileName: string): string {
    return this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media", fileName)).toString();
  }
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, text);
  return vscode.workspace.applyEdit(edit);
}
