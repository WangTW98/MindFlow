import * as vscode from "vscode";
import { createUntitledMindFlowDocumentOptions } from "../core/untitledMindFlowDocument";
import type { ProductFlow } from "../models/productFlow";
import { FlowEditorSession } from "./FlowEditorSession";
import { isAssociatedMindFlowUntitled, parseValidFlow } from "./flowDocument";
import { emptyFlowSelection, flowSelectionKey, type FlowSelectionPatch, type FlowSelectionState } from "./flowSelection";

type OpenFlowCallback = (flowUri: vscode.Uri) => void;

export class FlowPanel implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "mindflow.productFlow";

  private static provider: FlowPanel | undefined;
  private static readonly selections = new Map<string, FlowSelectionState>();

  private readonly sessions = new Map<string, FlowEditorSession>();

  public static register(
    context: vscode.ExtensionContext,
    onDidOpenFlow: OpenFlowCallback
  ): vscode.Disposable {
    const provider = new FlowPanel(context.extensionUri, onDidOpenFlow);
    FlowPanel.provider = provider;
    return vscode.window.registerCustomEditorProvider(FlowPanel.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    });
  }

  public static createOrShow(
    _extensionUri: vscode.Uri,
    flow: ProductFlow,
    flowUri: vscode.Uri | string
  ): void {
    const uri = typeof flowUri === "string" ? vscode.Uri.file(flowUri) : flowUri;
    const provider = FlowPanel.provider;
    if (provider?.renderSession(uri, flow)) {
      return;
    }
    void vscode.commands.executeCommand("vscode.openWith", uri, FlowPanel.viewType);
  }

  public static getSelection(flowUri: vscode.Uri | string): FlowSelectionState {
    return {
      ...emptyFlowSelection(),
      ...(FlowPanel.selections.get(flowSelectionKey(flowUri)) ?? {})
    };
  }

  public static setSelection(flowUri: vscode.Uri | string, selection: FlowSelectionPatch): void {
    FlowPanel.selections.set(flowSelectionKey(flowUri), {
      ...emptyFlowSelection(),
      ...selection
    });
  }

  public static updateSelection(flowUri: vscode.Uri | string, patch: FlowSelectionPatch): void {
    FlowPanel.setSelection(flowUri, {
      ...FlowPanel.getSelection(flowUri),
      ...patch
    });
  }

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onDidOpenFlow: OpenFlowCallback
  ) {}

  public resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): void {
    const flowKey = document.uri.toString();
    let migrationQueued = false;
    this.onDidOpenFlow(document.uri);
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media")]
    };

    const session = new FlowEditorSession(
      this.extensionUri,
      document,
      webviewPanel,
      {
        getSelection: (flowUri) => FlowPanel.getSelection(flowUri),
        setSelection: (flowUri, selection) => FlowPanel.setSelection(flowUri, selection)
      }
    );
    this.sessions.set(flowKey, session);

    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        if (queueMindFlowUntitledMigration(event.document)) {
          return;
        }
        session.renderFromDocument(event.document);
      }
    });
    const disposeListener = webviewPanel.onDidDispose(() => {
      changeListener.dispose();
      disposeListener.dispose();
      if (this.sessions.get(flowKey) === session) {
        this.sessions.delete(flowKey);
        FlowPanel.selections.delete(flowKey);
      }
    });

    if (!queueMindFlowUntitledMigration(document)) {
      session.renderFromDocument(document);
    }

    function queueMindFlowUntitledMigration(candidate: vscode.TextDocument): boolean {
      if (migrationQueued || !isAssociatedMindFlowUntitled(candidate)) {
        return false;
      }
      const flow = parseValidFlow(candidate.getText());
      if (!flow) {
        return false;
      }
      migrationQueued = true;
      void FlowPanel.provider?.reopenAsMindFlowUntitled(flow, webviewPanel).catch(() => {
        migrationQueued = false;
        session.renderFromDocument(candidate);
      });
      return true;
    }
  }

  private renderSession(flowUri: vscode.Uri, fallbackFlow: ProductFlow): boolean {
    const session = this.sessions.get(flowUri.toString());
    if (session) {
      session.renderWithFallback(fallbackFlow);
      session.reveal();
      return true;
    }
    return false;
  }

  private async reopenAsMindFlowUntitled(flow: ProductFlow, webviewPanel: vscode.WebviewPanel): Promise<void> {
    const replacementDocument = await vscode.workspace.openTextDocument(createUntitledMindFlowDocumentOptions(flow));
    await vscode.commands.executeCommand("vscode.openWith", replacementDocument.uri, FlowPanel.viewType);
    webviewPanel.dispose();
  }
}
