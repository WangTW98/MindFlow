import * as path from "node:path";
import * as vscode from "vscode";
import type { ProductFlow } from "../models/productFlow";
import { validateProductFlow } from "../models/productFlow";

type OpenFlowCallback = (flowUri: vscode.Uri) => void;

export class FlowPanel implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "mindflow.productFlow";
  public static selectedNodeId: string | undefined;
  public static selectedEdgeId: string | undefined;
  public static selectedAppSurfaceId: string | undefined;
  public static selectedDomainId: string | undefined;
  public static selectedRoleId: string | undefined;

  private static provider: FlowPanel | undefined;

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
    flowPath: string
  ): void {
    const provider = FlowPanel.provider;
    if (provider?.renderSession(flowPath, flow)) {
      return;
    }
    void vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(flowPath), FlowPanel.viewType);
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
    const flowPath = document.uri.fsPath;
    this.onDidOpenFlow(document.uri);
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media")]
    };

    const session = new FlowEditorSession(
      this.extensionUri,
      document,
      webviewPanel
    );
    this.sessions.set(flowPath, session);

    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === document.uri.toString()) {
        session.renderFromDocument(event.document);
      }
    });
    const disposeListener = webviewPanel.onDidDispose(() => {
      changeListener.dispose();
      disposeListener.dispose();
      if (this.sessions.get(flowPath) === session) {
        this.sessions.delete(flowPath);
      }
    });

    session.renderFromDocument(document);
  }

  private renderSession(flowPath: string, fallbackFlow: ProductFlow): boolean {
    const session = this.sessions.get(flowPath);
    if (session) {
      session.renderWithFallback(fallbackFlow);
      session.reveal();
      return true;
    }
    return false;
  }
}

class FlowEditorSession {
  private flow: ProductFlow | undefined;
  private messageQueue: Promise<void> = Promise.resolve();
  private readonly latestEdgeDetailsRevisions = new Map<string, number>();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel
  ) {
    this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.enqueueMessage(message));
  }

  public renderFromDocument(document: vscode.TextDocument): void {
    try {
      const parsed = JSON.parse(document.getText()) as unknown;
      const validation = validateProductFlow(parsed);
      if (!validation.valid) {
        this.renderError(`Invalid ProductFlow:\n${validation.errors.join("\n")}`);
        return;
      }
      this.flow = parsed as ProductFlow;
      this.renderFlow(this.flow);
    } catch (error) {
      this.renderError(error instanceof Error ? error.message : String(error));
    }
  }

  public renderWithFallback(fallbackFlow: ProductFlow): void {
    try {
      const parsed = JSON.parse(this.document.getText()) as unknown;
      const validation = validateProductFlow(parsed);
      const documentFlow = validation.valid ? parsed as ProductFlow : undefined;
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

  private enqueueMessage(message: WebviewMessage): void {
    const next = this.messageQueue.then(() => this.handleMessage(message));
    this.messageQueue = next.catch((error) => {
      console.error("MindFlow webview message failed", error);
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "selectNode":
        FlowPanel.selectedNodeId = message.nodeId;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        break;
      case "selectEdge":
        FlowPanel.selectedEdgeId = message.edgeId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        break;
      case "selectAppSurface":
        FlowPanel.selectedAppSurfaceId = message.appId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        break;
      case "selectDomain":
        FlowPanel.selectedDomainId = message.domainId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedRoleId = undefined;
        break;
      case "selectRole":
        FlowPanel.selectedRoleId = message.roleId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        break;
      case "clearSelection":
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        break;
      case "deleteNode":
        FlowPanel.selectedNodeId = message.nodeId;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        await vscode.commands.executeCommand("mindflow.removeNode", message.nodeId);
        break;
      case "saveNodePosition":
        await vscode.commands.executeCommand("mindflow.updateNodePosition", message.nodeId, message.x, message.y);
        break;
      case "saveAppSurfacePosition":
        await vscode.commands.executeCommand("mindflow.updateAppSurfacePosition", message.appId, message.x, message.y);
        break;
      case "createNodeAt":
        await vscode.commands.executeCommand(
          "mindflow.createNodeAt",
          message.x,
          message.y,
          message.appSurfaceIds,
          message.domainIds,
          message.roleIds
        );
        break;
      case "updateNodeDetails":
        await vscode.commands.executeCommand("mindflow.updateNodeDetails", message.nodeId, message.patch);
        break;
      case "createEdge":
        await vscode.commands.executeCommand("mindflow.createEdge", message.from, message.to, message.trigger, message.edgeType);
        break;
      case "createConnectedNodeAt":
        await vscode.commands.executeCommand("mindflow.createConnectedNodeAt", message.request);
        break;
      case "updateEdgeDetails":
        if (typeof message.revision === "number") {
          const latest = this.latestEdgeDetailsRevisions.get(message.edgeId) ?? 0;
          if (message.revision < latest) {
            return;
          }
          this.latestEdgeDetailsRevisions.set(message.edgeId, message.revision);
        }
        await vscode.commands.executeCommand("mindflow.updateEdgeDetails", message.edgeId, message.patch);
        break;
      case "removeEdge":
        await vscode.commands.executeCommand("mindflow.removeEdge", message.edgeId);
        break;
      case "updateTaxonomy":
        if (message.request.action === "delete") {
          if (message.request.kind === "appSurface") {
            FlowPanel.selectedAppSurfaceId = undefined;
          } else if (message.request.kind === "domain") {
            FlowPanel.selectedDomainId = undefined;
          } else if (message.request.kind === "role") {
            FlowPanel.selectedRoleId = undefined;
          }
        }
        await vscode.commands.executeCommand("mindflow.updateTaxonomy", message.request);
        break;
      default:
        break;
    }
  }

  private renderFlow(flow: ProductFlow): void {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media", "styles.css"));
    const nonce = getNonce();
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>MindFlow</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}">
    window.__MINDFLOW_STATE__ = ${escapeScriptJson({
      flow,
      flowPath: vscode.workspace.asRelativePath(this.document.uri, false),
      flowFileName: path.basename(this.document.uri.fsPath),
      selectedNodeId: FlowPanel.selectedNodeId ?? null,
      selectedEdgeId: FlowPanel.selectedEdgeId ?? null,
      selectedAppSurfaceId: FlowPanel.selectedAppSurfaceId ?? null,
      selectedDomainId: FlowPanel.selectedDomainId ?? null,
      selectedRoleId: FlowPanel.selectedRoleId ?? null
    })};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private renderError(message: string): void {
    const nonce = getNonce();
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MindFlow</title>
</head>
<body style="font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px;">
  <h2>MindFlow 无法打开此文件</h2>
  <pre style="white-space: pre-wrap;">${escapeHtml(message)}</pre>
  <script nonce="${nonce}"></script>
</body>
</html>`;
  }
}

type WebviewMessage =
  | { type: "selectNode"; nodeId: string }
  | { type: "selectEdge"; edgeId: string }
  | { type: "selectAppSurface"; appId: string }
  | { type: "selectDomain"; domainId: string }
  | { type: "selectRole"; roleId: string }
  | { type: "clearSelection" }
  | { type: "deleteNode"; nodeId: string; nodeTitle?: string }
  | { type: "saveNodePosition"; nodeId: string; x: number; y: number }
  | { type: "saveAppSurfacePosition"; appId: string; x: number; y: number }
  | { type: "createNodeAt"; x: number; y: number; appSurfaceIds?: string[]; domainIds?: string[]; roleIds?: string[] }
  | { type: "updateNodeDetails"; nodeId: string; patch: Record<string, unknown> }
  | { type: "createEdge"; from: Record<string, unknown>; to: Record<string, unknown>; trigger?: string; edgeType?: string }
  | { type: "createConnectedNodeAt"; request: Record<string, unknown> }
  | { type: "updateEdgeDetails"; edgeId: string; revision?: number; patch: Record<string, unknown> }
  | { type: "removeEdge"; edgeId: string }
  | { type: "updateTaxonomy"; request: Record<string, unknown> };

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chooseFresherFlow(documentFlow: ProductFlow, fallbackFlow: ProductFlow): ProductFlow {
  if (fallbackFlow.revision > documentFlow.revision) {
    return fallbackFlow;
  }
  if (fallbackFlow.revision < documentFlow.revision) {
    return documentFlow;
  }
  return flowUpdatedAtMs(fallbackFlow) > flowUpdatedAtMs(documentFlow) ? fallbackFlow : documentFlow;
}

function flowUpdatedAtMs(flow: ProductFlow): number {
  const value = Date.parse(flow.updatedAt);
  return Number.isFinite(value) ? value : 0;
}
