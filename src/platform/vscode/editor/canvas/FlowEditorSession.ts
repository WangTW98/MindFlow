import * as vscode from "vscode";
import { applyFlowOperations, type FlowOperation } from "../../../../product-flow/application/operations";
import type { ProductFlow } from "../../../../product-flow/domain";
import { parseProductFlowText, tryParseProductFlowText } from "../../../../product-flow/domain/serialization/codec";
import { editCurrentFlowDocument } from "../../documents/flowDocumentService";
import { chooseFresherFlow } from "./flowDocument";
import { dispatchFlowWebviewMessage, type FlowWebviewApplyOptions } from "./flowCommandDispatcher";
import { readRenderableDocumentText, replaceDocumentText as applyDocumentTextReplacement } from "./flowDocumentText";
import type { FlowEditorSelectionController } from "./flowSelectionController";
import type { FlowSelectionState } from "../../../../product-flow/domain/selection";
import { createFlowWebviewState } from "./flowWebviewState";
import {
  FLOW_WEBVIEW_SCRIPT_FILES,
  FLOW_WEBVIEW_STYLE_FILES,
  getNonce,
  createFlowErrorHtml,
  createFlowRestorePendingHtml,
  createFlowWebviewHtml
} from "./webviewShellHtml";
import { parseWebviewMessage, type WebviewMessage } from "../../../webview/protocol/flowWebviewMessages";

export class FlowEditorSession {
  private flow: ProductFlow | undefined;
  private hasRenderedHtml = false;
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
      const renderable = readRenderableDocumentText(document);
      if (renderable.replacementText) {
        void this.replaceDocumentText(document, renderable.replacementText);
      }
      const text = renderable.text;
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
      this.publishFlow(this.flow);
    } catch (error) {
      this.renderError(error instanceof Error ? error.message : String(error));
    }
  }

  public renderWithFallback(fallbackFlow: ProductFlow): void {
    try {
      const renderable = readRenderableDocumentText(this.document, fallbackFlow);
      if (renderable.replacementText) {
        void this.replaceDocumentText(this.document, renderable.replacementText);
      }
      const documentFlow = tryParseProductFlowText(renderable.text);
      this.flow = documentFlow ? chooseFresherFlow(documentFlow, fallbackFlow) : fallbackFlow;
      this.publishFlow(this.flow);
    } catch {
      this.flow = fallbackFlow;
      this.publishFlow(fallbackFlow);
    }
  }

  public reveal(): void {
    this.panel.reveal(vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One);
  }

  public applySelection(selection: FlowSelectionState): void {
    void this.panel.webview.postMessage({ type: "selectionChanged", selection });
  }

  private async replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
    const applied = await applyDocumentTextReplacement(document, text);
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
    await dispatchFlowWebviewMessage(message, {
      documentUri: this.document.uri,
      latestEdgeDetailsRevisions: this.latestEdgeDetailsRevisions,
      selectionController: this.selectionController,
      clipboard: vscode.env.clipboard,
      postCommandResult: (ok, message) => this.postCommandResult(ok, message),
      applyOperations: (label, operations, options) => this.applyCanvasOperations(label, operations, options)
    });
  }

  private async applyCanvasOperations(label: string, operations: readonly FlowOperation[], options: FlowWebviewApplyOptions = {}): Promise<void> {
    try {
      const { flow, flowUri, result } = await editCurrentFlowDocument(this.document.uri, (flow) => {
        const applied = applyFlowOperations(flow, operations, { atomic: options.atomic });
        replaceFlow(flow, applied.flow);
        return applied;
      });
      if (result.selection) {
        this.selectionController.setSelection(flowUri, result.selection);
      }
      this.flow = flow;
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

  private publishFlow(flow: ProductFlow): void {
    if (this.hasRenderedHtml) {
      void this.panel.webview.postMessage({ type: "flowChanged", flow });
      return;
    }
    const selection = this.selectionController.getSelection(this.document.uri);
    this.panel.webview.html = createFlowWebviewHtml({
      cspSource: this.panel.webview.cspSource,
      nonce: getNonce(),
      styleUris: FLOW_WEBVIEW_STYLE_FILES.map((fileName) => this.assetUri("webview", "canvas", "media", fileName)),
      scriptUris: FLOW_WEBVIEW_SCRIPT_FILES.map((fileName) => this.outUri("webview", "canvas", fileName)),
      initialState: createFlowWebviewState(flow, this.document, selection)
    });
    this.hasRenderedHtml = true;
  }

  private renderError(message: string): void {
    this.panel.webview.html = createFlowErrorHtml(message, getNonce());
    this.hasRenderedHtml = false;
  }

  private renderRestorePending(): void {
    this.panel.webview.html = createFlowRestorePendingHtml(getNonce());
    this.hasRenderedHtml = false;
  }

  private assetUri(...segments: string[]): string {
    return this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "assets", ...segments)).toString();
  }

  private outUri(...segments: string[]): string {
    return this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "out", ...segments)).toString();
  }
}

function replaceFlow(target: ProductFlow, source: ProductFlow): void {
  if (target === source) {
    return;
  }
  for (const key of Object.keys(target)) {
    delete (target as unknown as Record<string, unknown>)[key];
  }
  Object.assign(target, source);
}
