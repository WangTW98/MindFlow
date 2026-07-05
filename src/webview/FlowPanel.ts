import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { MINDFLOW_FILE_EXTENSION, createUntitledMindFlowDocumentOptions } from "../core/untitledMindFlowDocument";
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
  public static selectedStatusGroupId: string | undefined;

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
    flowUri: vscode.Uri | string
  ): void {
    const uri = typeof flowUri === "string" ? vscode.Uri.file(flowUri) : flowUri;
    const provider = FlowPanel.provider;
    if (provider?.renderSession(uri, flow)) {
      return;
    }
    void vscode.commands.executeCommand("vscode.openWith", uri, FlowPanel.viewType);
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
      webviewPanel
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
      const text = this.getRenderableDocumentText(document);
      if (!text.trim()) {
        if (document.isUntitled) {
          this.renderRestorePending();
        } else {
          this.renderError("MindFlow file is empty. Save valid .mindflow JSON or create a new blank MindFlow.");
        }
        return;
      }
      const parsed = JSON.parse(text) as unknown;
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
      const parsed = JSON.parse(this.getRenderableDocumentText(this.document, fallbackFlow)) as unknown;
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
      return serializeFlow(fallbackFlow);
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
        FlowPanel.selectedNodeId = message.nodeId;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        FlowPanel.selectedStatusGroupId = undefined;
        break;
      case "selectEdge":
        FlowPanel.selectedEdgeId = message.edgeId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        FlowPanel.selectedStatusGroupId = undefined;
        break;
      case "selectAppSurface":
        FlowPanel.selectedAppSurfaceId = message.appId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        FlowPanel.selectedStatusGroupId = undefined;
        break;
      case "selectDomain":
        FlowPanel.selectedDomainId = message.domainId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedRoleId = undefined;
        FlowPanel.selectedStatusGroupId = undefined;
        break;
      case "selectRole":
        FlowPanel.selectedRoleId = message.roleId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedStatusGroupId = undefined;
        break;
      case "selectStatusGroup":
        FlowPanel.selectedStatusGroupId = message.statusGroupId;
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        break;
      case "clearSelection":
        FlowPanel.selectedNodeId = undefined;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        FlowPanel.selectedStatusGroupId = undefined;
        break;
      case "deleteNode":
        FlowPanel.selectedNodeId = message.nodeId;
        FlowPanel.selectedEdgeId = undefined;
        FlowPanel.selectedAppSurfaceId = undefined;
        FlowPanel.selectedDomainId = undefined;
        FlowPanel.selectedRoleId = undefined;
        FlowPanel.selectedStatusGroupId = undefined;
        await vscode.commands.executeCommand("mindflow.removeNode", message.nodeId, this.document.uri);
        break;
      case "saveNodePosition":
        await vscode.commands.executeCommand("mindflow.updateNodePosition", message.nodeId, message.x, message.y, this.document.uri);
        break;
      case "saveAppSurfacePosition":
        await vscode.commands.executeCommand("mindflow.updateAppSurfacePosition", message.appId, message.x, message.y, this.document.uri);
        break;
      case "createNodeAt":
        await vscode.commands.executeCommand(
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
        await vscode.commands.executeCommand("mindflow.updateNodeDetails", message.nodeId, message.patch, this.document.uri);
        break;
      case "createEdge":
        await vscode.commands.executeCommand("mindflow.createEdge", message.from, message.to, message.trigger, message.edgeType, this.document.uri);
        break;
      case "createConnectedNodeAt":
        await vscode.commands.executeCommand("mindflow.createConnectedNodeAt", message.request, this.document.uri);
        break;
      case "updateEdgeDetails":
        if (typeof message.revision === "number") {
          const latest = this.latestEdgeDetailsRevisions.get(message.edgeId) ?? 0;
          if (message.revision < latest) {
            return;
          }
          this.latestEdgeDetailsRevisions.set(message.edgeId, message.revision);
        }
        await vscode.commands.executeCommand("mindflow.updateEdgeDetails", message.edgeId, message.patch, this.document.uri);
        break;
      case "removeEdge":
        await vscode.commands.executeCommand("mindflow.removeEdge", message.edgeId, this.document.uri);
        break;
      case "updateTaxonomy":
        if (message.request.action === "delete") {
          if (message.request.kind === "appSurface") {
            FlowPanel.selectedAppSurfaceId = undefined;
          } else if (message.request.kind === "domain") {
            FlowPanel.selectedDomainId = undefined;
          } else if (message.request.kind === "role") {
            FlowPanel.selectedRoleId = undefined;
          } else if (message.request.kind === "statusGroup") {
            FlowPanel.selectedStatusGroupId = undefined;
          }
        }
        await vscode.commands.executeCommand("mindflow.updateTaxonomy", message.request, this.document.uri);
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
      selectedRoleId: FlowPanel.selectedRoleId ?? null,
      selectedStatusGroupId: FlowPanel.selectedStatusGroupId ?? null
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

  private renderRestorePending(): void {
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
  <h2>MindFlow 正在恢复未保存内容</h2>
  <p>如果此状态持续存在，请从 VS Code 的时间线或备份恢复该未保存文档。</p>
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
  | { type: "selectStatusGroup"; statusGroupId: string }
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

function serializeFlow(flow: ProductFlow): string {
  return `${JSON.stringify(flow, null, 2)}\n`;
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, text);
  return vscode.workspace.applyEdit(edit);
}

function isAssociatedMindFlowUntitled(document: vscode.TextDocument): boolean {
  if (!document.isUntitled) {
    return false;
  }
  const uriText = document.uri.toString().toLowerCase();
  const fsPath = document.uri.fsPath.toLowerCase();
  return uriText.endsWith(MINDFLOW_FILE_EXTENSION) || path.extname(fsPath) === MINDFLOW_FILE_EXTENSION;
}

function parseValidFlow(text: string): ProductFlow | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    const validation = validateProductFlow(parsed);
    return validation.valid ? parsed as ProductFlow : undefined;
  } catch {
    return undefined;
  }
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
