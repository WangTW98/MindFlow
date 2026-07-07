import * as vscode from "vscode";
import { escapeHtml, getNonce } from "../editor/canvas/webviewShellHtml";
import type { SidebarState } from "./sidebarState";

export interface SidebarHtmlOptions {
  extensionUri: vscode.Uri;
  webview: vscode.Webview;
  state: SidebarState;
}

export function renderSidebarHtml(options: SidebarHtmlOptions): string {
  const nonce = getNonce();
  const style = options.webview.asWebviewUri(vscode.Uri.joinPath(options.extensionUri, "src", "adapters", "webview", "sidebar", "media", "sidebar.css"));
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.webview.cspSource}; script-src 'nonce-${nonce}';">
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
        <button id="clearRecent" class="icon-button" title="清除最近使用" ${options.state.flows.length === 0 ? "disabled" : ""}>清除</button>
      </header>
      <div class="list">
        ${options.state.flows.map((flow) => `
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

function renderRemoveIcon(): string {
  return `<svg class="lucide lucide-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
