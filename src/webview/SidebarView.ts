import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { FlowRepository } from "../storage/flowRepository";
import { RecentFlowStore, type RecentFlowRecord } from "../storage/recentFlows";

export class SidebarView implements vscode.WebviewViewProvider {
  public static readonly viewId = "mindflow.sidebar";

  private readonly recentFlows: RecentFlowStore;
  private readonly workspaceRecentFlows: RecentFlowStore;
  private webviewView: vscode.WebviewView | undefined;

  public constructor(private readonly context: vscode.ExtensionContext, private readonly getWorkspaceRoot: () => string) {
    this.recentFlows = new RecentFlowStore(context.globalState);
    this.workspaceRecentFlows = new RecentFlowStore(context.workspaceState);
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "media")]
    };
    webviewView.webview.html = await this.render(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: SidebarMessage) => {
      switch (message.type) {
        case "newMindFlow":
          await vscode.commands.executeCommand("mindflow.newFlow");
          break;
        case "openMindFlow":
          await vscode.commands.executeCommand("mindflow.openFlow");
          break;
        case "openFlow":
          await vscode.commands.executeCommand("mindflow.openFlow", message.flowPath);
          break;
        case "clearRecent":
          await this.recentFlows.clear();
          await this.workspaceRecentFlows.clear();
          await this.refresh();
          break;
        case "removeRecent":
          await this.recentFlows.remove(message.flowPath);
          await this.workspaceRecentFlows.remove(message.flowPath);
          await this.refresh();
          break;
        default:
          break;
      }
    });
  }

  public async refresh(): Promise<void> {
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.html = await this.render(this.webviewView.webview);
  }

  private async render(webview: vscode.Webview): Promise<string> {
    const nonce = getNonce();
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "media", "sidebar.css"));
    const state = await this.getState();
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${style}" rel="stylesheet">
  <title>MindFlow</title>
</head>
<body>
  <main>
    <section class="title">
      <h1>MindFlow</h1>
    </section>
    <section class="action-list">
      <button id="newMindFlow" class="list-item action-item"><span>新建 MindFlow</span></button>
      <button id="openMindFlow" class="list-item action-item"><span>打开 MindFlow</span></button>
    </section>
    <section>
      <header>
        <h2>最近使用</h2>
        <button id="clearRecent" class="icon-button" title="清除最近使用" ${state.flows.length === 0 ? "disabled" : ""}>清除</button>
      </header>
      <div class="list">
        ${state.flows.map((flow) => `
          <div class="recent-row">
            <button class="list-item recent-open" data-flow-path="${escapeAttr(flow.absolutePath)}">
              <span>${escapeHtml(flow.name)}</span>
              <small>${escapeHtml(flow.relativePath)}</small>
              <small>${escapeHtml(flow.usedLabel)}</small>
            </button>
            <button
              class="icon-button remove-recent"
              data-remove-flow-path="${escapeAttr(flow.absolutePath)}"
              title="移除最近使用记录"
              aria-label="移除 ${escapeAttr(flow.name)}"
            >${renderRemoveIcon()}</button>
          </div>
        `).join("") || "<p class=\"empty\">暂无历史 MindFlow 文件</p>"}
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById("newMindFlow").addEventListener("click", () => vscode.postMessage({ type: "newMindFlow" }));
    document.getElementById("openMindFlow").addEventListener("click", () => vscode.postMessage({ type: "openMindFlow" }));
    document.getElementById("clearRecent").addEventListener("click", () => vscode.postMessage({ type: "clearRecent" }));
    document.querySelectorAll("[data-flow-path]").forEach((button) => {
      button.addEventListener("click", () => vscode.postMessage({ type: "openFlow", flowPath: button.dataset.flowPath }));
    });
    document.querySelectorAll("[data-remove-flow-path]").forEach((button) => {
      button.addEventListener("click", () => vscode.postMessage({ type: "removeRecent", flowPath: button.dataset.removeFlowPath }));
    });
  </script>
</body>
</html>`;
  }

  private async getState(): Promise<SidebarState> {
    let workspaceRoot = "";
    try {
      workspaceRoot = this.getWorkspaceRoot();
    } catch {
      workspaceRoot = "";
    }
    const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
    const repository = workspaceRoot ? new FlowRepository(workspaceRoot, flowDirectory) : undefined;
    let recentRecords = await this.getGlobalRecentRecords();
    if (!recentRecords && repository) {
      const seededRecords = await seedRecentFlowRecords(await repository.list().catch(() => []));
      await this.recentFlows.replace(seededRecords);
      recentRecords = this.recentFlows.get();
    }
    const flows = await Promise.all((recentRecords ?? []).map((record) => toFlowItem(workspaceRoot, record)));
    flows.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    return {
      flows
    };
  }

  private async getGlobalRecentRecords(): Promise<RecentFlowRecord[] | undefined> {
    const globalRecords = this.recentFlows.get();
    const workspaceRecords = this.workspaceRecentFlows.get();
    if (workspaceRecords?.length) {
      await this.recentFlows.replace([...(globalRecords ?? []), ...workspaceRecords]);
      return this.recentFlows.get();
    }
    return globalRecords;
  }
}

interface SidebarState {
  flows: FlowItem[];
}

interface FlowItem {
  absolutePath: string;
  relativePath: string;
  name: string;
  lastOpenedAt: number;
  usedLabel: string;
}

type SidebarMessage =
  | { type: "newMindFlow" }
  | { type: "openMindFlow" }
  | { type: "openFlow"; flowPath: string }
  | { type: "clearRecent" }
  | { type: "removeRecent"; flowPath: string };

async function seedRecentFlowRecords(files: string[]): Promise<RecentFlowRecord[]> {
  const records = await Promise.all(
    files.map(async (file) => ({
      absolutePath: file,
      lastOpenedAt: (await fs.stat(file).catch(() => ({ mtimeMs: 0 }))).mtimeMs
    }))
  );
  return records.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

async function toFlowItem(workspaceRoot: string, record: RecentFlowRecord): Promise<FlowItem> {
  const stats = await fs.stat(record.absolutePath).catch(() => undefined);
  const lastOpenedAt = record.lastOpenedAt || stats?.mtimeMs || 0;
  return {
    absolutePath: record.absolutePath,
    relativePath: workspaceRoot ? path.relative(workspaceRoot, record.absolutePath) : record.absolutePath,
    name: path.basename(record.absolutePath),
    lastOpenedAt,
    usedLabel: lastOpenedAt ? `最近打开 ${formatDateTime(lastOpenedAt)}` : "最近打开时间未知"
  };
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderRemoveIcon(): string {
  return `<svg class="lucide lucide-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
