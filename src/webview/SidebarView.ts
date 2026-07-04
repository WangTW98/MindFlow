import * as path from "node:path";
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { FlowRepository } from "../storage/flowRepository";
import { RecentFlowStore, type RecentFlowRecord } from "../storage/recentFlows";

export class SidebarView implements vscode.WebviewViewProvider {
  public static readonly viewId = "mindflow.sidebar";

  private readonly recentFlows: RecentFlowStore;
  private webviewView: vscode.WebviewView | undefined;

  public constructor(private readonly context: vscode.ExtensionContext, private readonly getWorkspaceRoot: () => string) {
    this.recentFlows = new RecentFlowStore(context.workspaceState);
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
          await vscode.commands.executeCommand("mindflow.analyzeDocument");
          break;
        case "openMindFlow":
          await vscode.commands.executeCommand("mindflow.openFlow");
          break;
        case "openFlow":
          await vscode.commands.executeCommand("mindflow.openFlow", message.flowPath);
          break;
        case "clearRecent":
          await this.recentFlows.clear();
          await this.refresh();
          break;
        case "removeRecent":
          await this.recentFlows.remove(message.flowPath);
          await this.refresh();
          break;
        case "refreshAgents":
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
    <section>
      <header>
        <h2>已发现Agent</h2>
        <button id="refreshAgents" class="icon-button" title="刷新已发现Agent">刷新</button>
      </header>
      <div class="list">
        ${state.agents.map((agent) => `
          <div class="agent-row">
            <span class="status ${agent.available ? "ok" : "missing"}"></span>
            <div>
              <strong>${escapeHtml(agent.label)}</strong>
              <small>${escapeHtml(agent.detail)}</small>
            </div>
          </div>
        `).join("") || "<p class=\"empty\">未发现可用 Agent</p>"}
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById("newMindFlow").addEventListener("click", () => vscode.postMessage({ type: "newMindFlow" }));
    document.getElementById("openMindFlow").addEventListener("click", () => vscode.postMessage({ type: "openMindFlow" }));
    document.getElementById("clearRecent").addEventListener("click", () => vscode.postMessage({ type: "clearRecent" }));
    document.getElementById("refreshAgents").addEventListener("click", () => vscode.postMessage({ type: "refreshAgents" }));
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
    let recentRecords = this.recentFlows.get();
    if (!recentRecords && repository) {
      const seededRecords = await seedRecentFlowRecords(await repository.list().catch(() => []));
      await this.recentFlows.replace(seededRecords);
      recentRecords = this.recentFlows.get();
    }
    const flows = await Promise.all((recentRecords ?? []).map((record) => toFlowItem(workspaceRoot, record)));
    flows.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    const detectedAgents = await Promise.all(MCP_CLIENT_CANDIDATES.map((candidate) => detectAgent(candidate)));
    return {
      flows,
      agents: detectedAgents.filter((agent) => agent.available)
    };
  }
}

interface SidebarState {
  flows: FlowItem[];
  agents: AgentStatus[];
}

interface FlowItem {
  absolutePath: string;
  relativePath: string;
  name: string;
  lastOpenedAt: number;
  usedLabel: string;
}

interface AgentStatus {
  label: string;
  available: boolean;
  detail: string;
}

interface AgentCandidate {
  label: string;
  commands: string[];
  args: string[];
}

type SidebarMessage =
  | { type: "newMindFlow" }
  | { type: "openMindFlow" }
  | { type: "openFlow"; flowPath: string }
  | { type: "clearRecent" }
  | { type: "removeRecent"; flowPath: string }
  | { type: "refreshAgents" };

const MCP_CLIENT_CANDIDATES: AgentCandidate[] = [
  { label: "Codex CLI", commands: ["codex"], args: ["--version"] },
  { label: "Claude Code", commands: ["claude"], args: ["--version"] },
  { label: "Gemini CLI", commands: ["gemini"], args: ["--version"] },
  { label: "Cursor", commands: ["cursor"], args: ["--version"] },
  { label: "Windsurf", commands: ["windsurf"], args: ["--version"] },
  { label: "OpenCode", commands: ["opencode"], args: ["--version"] },
  { label: "Goose", commands: ["goose"], args: ["--version"] },
  { label: "Qwen Code", commands: ["qwen", "qwen-code"], args: ["--version"] }
];

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

async function detectAgent(candidate: AgentCandidate): Promise<AgentStatus> {
  const commands = unique(candidate.commands.flatMap((command) => getCommandCandidates(command)));
  for (const command of commands) {
    const status = await detectCommand(candidate.label, command, candidate.args);
    if (status.available) {
      return status;
    }
  }
  return { label: candidate.label, available: false, detail: `${candidate.commands[0]} 未找到` };
}

function detectCommand(label: string, command: string, args: string[]): Promise<AgentStatus> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const finish = (status: AgentStatus): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(status);
    };
    const timeout = setTimeout(() => {
      child.kill?.();
      finish({ label, available: true, detail: `${path.basename(command)} 可执行，版本检测超时` });
    }, 1500);
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => {
      finish({ label, available: false, detail: `${command} 未找到` });
    });
    child.on("close", (code) => {
      const firstLine = output.trim().split(/\r?\n/)[0];
      finish({ label, available: true, detail: firstLine || `${path.basename(command)} detected (exit ${code ?? "unknown"})` });
    });
  });
}

function getCommandCandidates(command: string): string[] {
  const home = process.env.HOME;
  return [
    command,
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/usr/bin/${command}`,
    home ? path.join(home, ".local", "bin", command) : "",
    home ? path.join(home, ".npm-global", "bin", command) : ""
  ].filter(Boolean);
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
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
