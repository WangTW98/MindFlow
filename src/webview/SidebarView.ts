import * as path from "node:path";
import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { FlowRepository } from "../storage/flowRepository";

export class SidebarView implements vscode.WebviewViewProvider {
  public static readonly viewId = "mindflow.sidebar";

  public constructor(private readonly extensionUri: vscode.Uri, private readonly getWorkspaceRoot: () => string) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    webviewView.webview.html = await this.render(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: SidebarMessage) => {
      switch (message.type) {
        case "newMindFlow":
          await vscode.commands.executeCommand("mindflow.analyzeDocument");
          break;
        case "openFlow":
          await vscode.commands.executeCommand("mindflow.openFlow", message.flowPath);
          break;
        case "refresh":
          webviewView.webview.html = await this.render(webviewView.webview);
          break;
        default:
          break;
      }
    });
  }

  private async render(webview: vscode.Webview): Promise<string> {
    const nonce = getNonce();
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "media", "sidebar.css"));
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
    <section class="hero">
      <h1>MindFlow</h1>
      <button id="newMindFlow">新建 MindFlow</button>
    </section>
    <section>
      <header>
        <h2>历史</h2>
        <button id="refresh" class="icon-button" title="刷新">刷新</button>
      </header>
      <div class="list">
        ${state.flows.map((flow) => `
          <button class="list-item" data-flow-path="${escapeAttr(flow.absolutePath)}">
            <span>${escapeHtml(flow.name)}</span>
            <small>${escapeHtml(flow.relativePath)}</small>
          </button>
        `).join("") || "<p class=\"empty\">暂无历史 MindFlow 文件</p>"}
      </div>
    </section>
    <section>
      <header><h2>可用 Agent</h2></header>
      <div class="list">
        ${state.agents.map((agent) => `
          <div class="agent-row">
            <span class="status ${agent.available ? "ok" : "missing"}"></span>
            <div>
              <strong>${escapeHtml(agent.label)}</strong>
              <small>${escapeHtml(agent.detail)}</small>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById("newMindFlow").addEventListener("click", () => vscode.postMessage({ type: "newMindFlow" }));
    document.getElementById("refresh").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
    document.querySelectorAll("[data-flow-path]").forEach((button) => {
      button.addEventListener("click", () => vscode.postMessage({ type: "openFlow", flowPath: button.dataset.flowPath }));
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
    const repository = workspaceRoot ? new FlowRepository(workspaceRoot, ".mindflow/flows") : undefined;
    const files = repository ? await repository.list().catch(() => []) : [];
    const agents = await Promise.all([
      detectAgent("Codex CLI", "codex", ["--version"]),
      detectAgent("Gemini CLI", "gemini", ["--version"]),
      detectAgent("Claude Code", "claude", ["--version"])
    ]);
    return {
      flows: files.map((file) => ({
        absolutePath: file,
        relativePath: workspaceRoot ? path.relative(workspaceRoot, file) : file,
        name: path.basename(file)
      })),
      agents
    };
  }
}

interface SidebarState {
  flows: Array<{ absolutePath: string; relativePath: string; name: string }>;
  agents: AgentStatus[];
}

interface AgentStatus {
  label: string;
  available: boolean;
  detail: string;
}

type SidebarMessage =
  | { type: "newMindFlow" }
  | { type: "openFlow"; flowPath: string }
  | { type: "refresh" };

function detectAgent(label: string, command: string, args: string[]): Promise<AgentStatus> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => {
      resolve({ label, available: true, detail: "可执行，但版本检测超时" });
    }, 2500);
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolve({ label, available: false, detail: `${command} 未找到` });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const firstLine = output.trim().split(/\r?\n/)[0] || `exit ${code ?? "unknown"}`;
      resolve({ label, available: code === 0, detail: firstLine });
    });
  });
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
