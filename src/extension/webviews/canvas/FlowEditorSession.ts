import * as vscode from "vscode";
import type { ProductFlow } from "../../../domain/product-flow";
import { parseProductFlowText, serializeProductFlow, tryParseProductFlowText } from "../../../domain/product-flow/codec";
import { chooseFresherFlow } from "./flowDocument";
import { dispatchFlowWebviewMessage } from "./flowCommandDispatcher";
import { readRenderableDocumentText, replaceDocumentText as applyDocumentTextReplacement } from "./flowDocumentText";
import type { FlowEditorSelectionController } from "./flowSelectionController";
import { createFlowWebviewState } from "./flowWebviewState";
import {
  FLOW_WEBVIEW_SCRIPT_FILES,
  FLOW_WEBVIEW_STYLE_FILES,
  getNonce,
  renderFlowErrorHtml,
  renderFlowRestorePendingHtml,
  renderFlowWebviewHtml
} from "./flowWebviewHtml";
import { parseWebviewMessage, type WebviewMessage } from "../../../webview/flowWebviewMessages";

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
      const renderable = readRenderableDocumentText(this.document, fallbackFlow);
      if (renderable.replacementText) {
        void this.replaceDocumentText(this.document, renderable.replacementText);
      }
      const documentFlow = tryParseProductFlowText(renderable.text);
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
      executeCommand: (label, command, ...args) => this.executeMindFlowCommand(label, command, ...args)
    });
  }

  private async executeMindFlowCommand(label: string, command: string, ...args: unknown[]): Promise<void> {
    try {
      const ok = await vscode.commands.executeCommand<boolean | undefined>(command, ...args);
      if (ok === false) {
        this.postCommandResult(false, `${label}失败，文档未更新。`, true);
        return;
      }
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
      initialState: createFlowWebviewState(flow, this.document, selection)
    });
  }

  private renderError(message: string): void {
    this.panel.webview.html = renderFlowErrorHtml(message, getNonce());
  }

  private renderRestorePending(): void {
    this.panel.webview.html = renderFlowRestorePendingHtml(getNonce());
  }

  private mediaUri(fileName: string): string {
    return this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media", ...fileName.split("/"))).toString();
  }
}
