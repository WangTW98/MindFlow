import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { MINDFLOW_FILE_EXTENSION, createUntitledMindFlowDocumentOptions } from "../core/untitledMindFlowDocument";
import type { EdgeType, FlowEndpoint, ProductFlow } from "../models/productFlow";
import { isEdgeType, isFlowEndpointKind } from "../models/productFlow";
import type { TaxonomyRequest } from "../core/taxonomy";
import { parseProductFlowText, serializeProductFlow, tryParseProductFlowText } from "../models/productFlowCodec";

type OpenFlowCallback = (flowUri: vscode.Uri) => void;

interface FlowSelectionState {
  selectedProjectOverview: boolean;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  selectedAppSurfaceId?: string;
  selectedDomainId?: string;
  selectedRoleId?: string;
  selectedStatusGroupId?: string;
}

type FlowSelectionPatch = Partial<FlowSelectionState>;

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
      ...emptySelection(),
      ...(FlowPanel.selections.get(selectionKey(flowUri)) ?? {})
    };
  }

  public static setSelection(flowUri: vscode.Uri | string, selection: FlowSelectionPatch): void {
    FlowPanel.selections.set(selectionKey(flowUri), {
      ...emptySelection(),
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

class FlowEditorSession {
  private flow: ProductFlow | undefined;
  private messageQueue: Promise<void> = Promise.resolve();
  private readonly latestEdgeDetailsRevisions = new Map<string, number>();

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel
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
        if (typeof message.revision === "number") {
          const latest = this.latestEdgeDetailsRevisions.get(message.edgeId) ?? 0;
          if (message.revision < latest) {
            return;
          }
          this.latestEdgeDetailsRevisions.set(message.edgeId, message.revision);
        }
        await this.executeMindFlowCommand("更新连线详情", "mindflow.updateEdgeDetails", message.edgeId, message.patch, this.document.uri);
        break;
      case "removeEdge":
        await this.executeMindFlowCommand("删除连线", "mindflow.removeEdge", message.edgeId, this.document.uri);
        break;
      case "updateTaxonomy":
        if (message.request.action === "delete") {
          const selection = FlowPanel.getSelection(this.document.uri);
          if (message.request.kind === "appSurface") {
            selection.selectedAppSurfaceId = undefined;
          } else if (message.request.kind === "domain") {
            selection.selectedDomainId = undefined;
          } else if (message.request.kind === "role") {
            selection.selectedRoleId = undefined;
          } else if (message.request.kind === "statusGroup") {
            selection.selectedStatusGroupId = undefined;
          }
          FlowPanel.setSelection(this.document.uri, selection);
        }
        await this.executeMindFlowCommand("更新元数据", "mindflow.updateTaxonomy", message.request, this.document.uri);
        break;
      default:
        break;
    }
  }

  private setSelection(selection: FlowSelectionPatch): void {
    FlowPanel.setSelection(this.document.uri, selection);
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
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media", "main.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media", "styles.css"));
    const nonce = getNonce();
    const selection = FlowPanel.getSelection(this.document.uri);
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
      selectedProjectOverview: selection.selectedProjectOverview,
      selectedNodeId: selection.selectedNodeId ?? null,
      selectedEdgeId: selection.selectedEdgeId ?? null,
      selectedAppSurfaceId: selection.selectedAppSurfaceId ?? null,
      selectedDomainId: selection.selectedDomainId ?? null,
      selectedRoleId: selection.selectedRoleId ?? null,
      selectedStatusGroupId: selection.selectedStatusGroupId ?? null
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

function emptySelection(): FlowSelectionState {
  return {
    selectedProjectOverview: false,
    selectedNodeId: undefined,
    selectedEdgeId: undefined,
    selectedAppSurfaceId: undefined,
    selectedDomainId: undefined,
    selectedRoleId: undefined,
    selectedStatusGroupId: undefined
  };
}

function selectionKey(flowUri: vscode.Uri | string): string {
  return typeof flowUri === "string" ? flowUri : flowUri.toString();
}

type WebviewMessage =
  | { type: "selectNode"; nodeId: string }
  | { type: "selectEdge"; edgeId: string }
  | { type: "selectAppSurface"; appId: string }
  | { type: "selectDomain"; domainId: string }
  | { type: "selectRole"; roleId: string }
  | { type: "selectStatusGroup"; statusGroupId: string }
  | { type: "selectProjectOverview" }
  | { type: "clearSelection" }
  | { type: "deleteNode"; nodeId: string; nodeTitle?: string }
  | { type: "saveNodePosition"; nodeId: string; x: number; y: number }
  | { type: "saveAppSurfacePosition"; appId: string; x: number; y: number }
  | { type: "saveProjectOverviewPosition"; x: number; y: number }
  | { type: "createNodeAt"; x: number; y: number; appSurfaceIds?: string[]; domainIds?: string[]; roleIds?: string[] }
  | { type: "updateNodeDetails"; nodeId: string; patch: Record<string, unknown> }
  | { type: "updateProjectOverview"; patch: Record<string, unknown> }
  | { type: "createEdge"; from: FlowEndpoint; to: FlowEndpoint; trigger?: string; edgeType?: EdgeType }
  | { type: "createConnectedNodeAt"; request: Record<string, unknown> }
  | { type: "updateEdgeDetails"; edgeId: string; revision?: number; patch: Record<string, unknown> }
  | { type: "removeEdge"; edgeId: string }
  | { type: "updateTaxonomy"; request: TaxonomyRequest };

function parseWebviewMessage(message: unknown): WebviewMessage | undefined {
  if (!isRecord(message) || typeof message.type !== "string") {
    return undefined;
  }

  switch (message.type) {
    case "selectNode": {
      const nodeId = readString(message, "nodeId");
      return nodeId ? { type: "selectNode", nodeId } : undefined;
    }
    case "selectEdge": {
      const edgeId = readString(message, "edgeId");
      return edgeId ? { type: "selectEdge", edgeId } : undefined;
    }
    case "selectAppSurface": {
      const appId = readString(message, "appId");
      return appId ? { type: "selectAppSurface", appId } : undefined;
    }
    case "selectDomain": {
      const domainId = readString(message, "domainId");
      return domainId ? { type: "selectDomain", domainId } : undefined;
    }
    case "selectRole": {
      const roleId = readString(message, "roleId");
      return roleId ? { type: "selectRole", roleId } : undefined;
    }
    case "selectStatusGroup": {
      const statusGroupId = readString(message, "statusGroupId");
      return statusGroupId ? { type: "selectStatusGroup", statusGroupId } : undefined;
    }
    case "selectProjectOverview":
    case "clearSelection":
      return { type: message.type };
    case "deleteNode": {
      const nodeId = readString(message, "nodeId");
      return nodeId ? { type: "deleteNode", nodeId, nodeTitle: readOptionalString(message, "nodeTitle") } : undefined;
    }
    case "saveNodePosition": {
      const nodeId = readString(message, "nodeId");
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return nodeId && x !== undefined && y !== undefined ? { type: "saveNodePosition", nodeId, x, y } : undefined;
    }
    case "saveAppSurfacePosition": {
      const appId = readString(message, "appId");
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return appId && x !== undefined && y !== undefined ? { type: "saveAppSurfacePosition", appId, x, y } : undefined;
    }
    case "saveProjectOverviewPosition": {
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return x !== undefined && y !== undefined ? { type: "saveProjectOverviewPosition", x, y } : undefined;
    }
    case "createNodeAt": {
      const x = readNumber(message, "x");
      const y = readNumber(message, "y");
      return x !== undefined && y !== undefined
        ? {
            type: "createNodeAt",
            x,
            y,
            appSurfaceIds: readOptionalStringArray(message, "appSurfaceIds"),
            domainIds: readOptionalStringArray(message, "domainIds"),
            roleIds: readOptionalStringArray(message, "roleIds")
          }
        : undefined;
    }
    case "updateNodeDetails": {
      const nodeId = readString(message, "nodeId");
      const patch = readRecord(message, "patch");
      return nodeId && patch ? { type: "updateNodeDetails", nodeId, patch } : undefined;
    }
    case "updateProjectOverview": {
      const patch = readRecord(message, "patch");
      return patch ? { type: "updateProjectOverview", patch } : undefined;
    }
    case "createEdge": {
      const from = readEndpoint(message.from);
      const to = readEndpoint(message.to);
      const edgeType = readOptionalEdgeType(message, "edgeType");
      return from && to && edgeType !== false
        ? { type: "createEdge", from, to, trigger: readOptionalString(message, "trigger"), edgeType: edgeType ?? undefined }
        : undefined;
    }
    case "createConnectedNodeAt": {
      const request = readConnectedNodeRequest(message.request);
      return request ? { type: "createConnectedNodeAt", request } : undefined;
    }
    case "updateEdgeDetails": {
      const edgeId = readString(message, "edgeId");
      const patch = readEdgeDetailsPatch(message.patch);
      const revision = readOptionalNumber(message, "revision");
      return edgeId && patch && revision !== false ? { type: "updateEdgeDetails", edgeId, revision: revision ?? undefined, patch } : undefined;
    }
    case "removeEdge": {
      const edgeId = readString(message, "edgeId");
      return edgeId ? { type: "removeEdge", edgeId } : undefined;
    }
    case "updateTaxonomy": {
      const request = readTaxonomyRequest(message.request);
      return request ? { type: "updateTaxonomy", request } : undefined;
    }
    default:
      return undefined;
  }
}

function readConnectedNodeRequest(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = value.from === undefined ? undefined : readEndpoint(value.from);
  const to = value.to === undefined ? undefined : readEndpoint(value.to);
  if (!from && !to) {
    return undefined;
  }
  const type = value.type === undefined ? undefined : readEdgeType(value.type);
  if (value.type !== undefined && !type) {
    return undefined;
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(typeof value.x === "number" && Number.isFinite(value.x) ? { x: value.x } : {}),
    ...(typeof value.y === "number" && Number.isFinite(value.y) ? { y: value.y } : {}),
    ...(typeof value.trigger === "string" ? { trigger: value.trigger } : {}),
    ...(type ? { type } : {}),
    ...(readOptionalStringArray(value, "appSurfaceIds") ? { appSurfaceIds: readOptionalStringArray(value, "appSurfaceIds") } : {}),
    ...(readOptionalStringArray(value, "domainIds") ? { domainIds: readOptionalStringArray(value, "domainIds") } : {}),
    ...(readOptionalStringArray(value, "roleIds") ? { roleIds: readOptionalStringArray(value, "roleIds") } : {})
  };
}

function readEdgeDetailsPatch(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = value.from === undefined ? undefined : readEndpoint(value.from);
  const to = value.to === undefined ? undefined : readEndpoint(value.to);
  const edgeType = value.type === undefined ? undefined : readEdgeType(value.type);
  if ((value.from !== undefined && !from) || (value.to !== undefined && !to) || (value.type !== undefined && !edgeType)) {
    return undefined;
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(typeof value.trigger === "string" ? { trigger: value.trigger } : {}),
    ...(typeof value.action === "string" ? { action: value.action } : {}),
    ...(edgeType ? { type: edgeType } : {}),
    ...(typeof value.condition === "string" ? { condition: value.condition } : {}),
    ...(readOptionalStringArray(value, "appSurfaceIds") ? { appSurfaceIds: readOptionalStringArray(value, "appSurfaceIds") } : {}),
    ...(readOptionalStringArray(value, "domainIds") ? { domainIds: readOptionalStringArray(value, "domainIds") } : {}),
    ...(readOptionalStringArray(value, "roleIds") ? { roleIds: readOptionalStringArray(value, "roleIds") } : {})
  };
}

function readEndpoint(value: unknown): FlowEndpoint | undefined {
  if (!isRecord(value) || !isFlowEndpointKind(value.kind)) {
    return undefined;
  }
  const nodeId = readString(value, "nodeId");
  if (!nodeId) {
    return undefined;
  }
  if (value.kind === "appSurface") {
    const appId = readOptionalString(value, "appId") ?? nodeId;
    return { kind: "appSurface", nodeId: appId, appId };
  }
  if (value.kind === "projectOverview") {
    return nodeId === "projectOverview" ? { kind: "projectOverview", nodeId } : undefined;
  }
  const groupId = readOptionalString(value, "groupId");
  const itemId = readOptionalString(value, "itemId");
  if (value.kind === "featureGroup" && !groupId) {
    return undefined;
  }
  if (value.kind === "featureItem" && (!groupId || !itemId)) {
    return undefined;
  }
  return {
    kind: value.kind,
    nodeId,
    ...(groupId ? { groupId } : {}),
    ...(itemId ? { itemId } : {})
  };
}

function readTaxonomyRequest(value: unknown): TaxonomyRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = value.kind;
  const action = value.action;
  if (kind !== "appSurface" && kind !== "domain" && kind !== "role" && kind !== "statusGroup") {
    return undefined;
  }
  if (action !== "create" && action !== "update" && action !== "delete") {
    return undefined;
  }
  const id = readOptionalString(value, "id");
  const item = readRecord(value, "item");
  if (action === "delete" && !id) {
    return undefined;
  }
  return { kind, action, ...(id ? { id } : {}), ...(item ? { item } : {}) };
}

function readOptionalEdgeType(obj: Record<string, unknown>, key: string): EdgeType | false | undefined {
  if (obj[key] === undefined) {
    return undefined;
  }
  return readEdgeType(obj[key]) ?? false;
}

function readEdgeType(value: unknown): EdgeType | undefined {
  return isEdgeType(value) ? value : undefined;
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" && obj[key].trim() ? obj[key] : undefined;
}

function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" ? obj[key] : undefined;
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  return typeof obj[key] === "number" && Number.isFinite(obj[key]) ? obj[key] : undefined;
}

function readOptionalNumber(obj: Record<string, unknown>, key: string): number | false | undefined {
  if (obj[key] === undefined) {
    return undefined;
  }
  return typeof obj[key] === "number" && Number.isFinite(obj[key]) ? obj[key] : false;
}

function readOptionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function readRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = obj[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  return tryParseProductFlowText(text);
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
