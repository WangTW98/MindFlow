import * as vscode from "vscode";
import { FlowEditorRegistry, type OpenFlowEditorSession } from "../../editors/FlowEditorRegistry";
import { FlowSelectionStore } from "../../editors/FlowSelectionStore";
import type { ProductFlow } from "../../../domain/product-flow";
import { FlowEditorSession } from "./FlowEditorSession";
import type { FlowSelectionPatch, FlowSelectionState } from "../../../domain/selection";

type OpenFlowCallback = (flowUri: vscode.Uri) => void;

export class FlowPanel implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "mindflow.productFlow";

  private static provider: FlowPanel | undefined;
  private static readonly selections = new FlowSelectionStore();
  private static readonly registry = new FlowEditorRegistry();

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
    if (provider && FlowPanel.registry.renderSession(uri, flow)) {
      return;
    }
    void vscode.commands.executeCommand("vscode.openWith", uri, FlowPanel.viewType);
  }

  public static getSelection(flowUri: vscode.Uri | string): FlowSelectionState {
    return FlowPanel.selections.get(flowUri);
  }

  public static setSelection(flowUri: vscode.Uri | string, selection: FlowSelectionPatch): void {
    FlowPanel.selections.set(flowUri, selection);
  }

  public static updateSelection(flowUri: vscode.Uri | string, patch: FlowSelectionPatch): void {
    FlowPanel.selections.update(flowUri, patch);
  }

  public static getActiveFlowUri(): vscode.Uri | undefined {
    return FlowPanel.registry.getActiveFlowUri();
  }

  public static getOpenEditorSessions(): OpenFlowEditorSession[] {
    return FlowPanel.registry.getOpenEditorSessions();
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
    FlowPanel.registry.setActive(document.uri);
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
    FlowPanel.registry.register(document.uri, document, session);

    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        session.renderFromDocument(event.document);
      }
    });
    const viewStateListener = webviewPanel.onDidChangeViewState?.((event) => {
      if (event.webviewPanel.active) {
        FlowPanel.registry.setActive(document.uri);
        this.onDidOpenFlow(document.uri);
      }
    });
    const disposeListener = webviewPanel.onDidDispose(() => {
      changeListener.dispose();
      viewStateListener?.dispose();
      disposeListener.dispose();
      FlowPanel.registry.remove(document.uri, session);
      FlowPanel.selections.delete(document.uri);
    });

    session.renderFromDocument(document);
  }
}
