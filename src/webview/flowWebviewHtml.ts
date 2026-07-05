export const FLOW_WEBVIEW_STYLE_FILES = [
  "styles.css",
  "styles-layout.css",
  "styles-canvas.css",
  "styles-cards.css",
  "styles-project-overview.css",
  "styles-inspector.css",
  "styles-inspector-pickers.css",
  "styles-inspector-forms.css"
] as const;

export const FLOW_WEBVIEW_SCRIPT_FILES = [
  "state/canvas-namespace.js",
  "state/canvas-boot-helpers.js",
  "state/canvas-state.js",
  "render/canvas-icons.js",
  "render/canvas-project-overview.js",
  "render/canvas-app-surfaces.js",
  "render/canvas-taxonomy.js",
  "render/canvas-form-controls.js",
  "render/canvas-node-cards.js",
  "render/canvas-node-inspector.js",
  "render/canvas-taxonomy-inspector.js",
  "render/canvas-edge-inspector.js",
  "render/canvas-render.js",
  "events/canvas-camera.js",
  "events/canvas-connections.js",
  "events/canvas-inline-title.js",
  "events/canvas-element-bindings.js",
  "events/canvas-taxonomy-bindings.js",
  "events/canvas-feature-editor.js",
  "events/canvas-inspector-bindings.js",
  "events/canvas-bindings.js",
  "events/canvas-interactions.js",
  "details/canvas-details.js",
  "details/canvas-node-details.js",
  "details/canvas-taxonomy-details.js",
  "details/canvas-edge-details.js",
  "view/canvas-endpoint-pickers.js",
  "view/canvas-edge-view.js",
  "view/canvas-view.js",
  "data/canvas-feature-data.js",
  "data/canvas-taxonomy-data.js",
  "data/canvas-color-data.js",
  "data/canvas-ui-state.js",
  "data/canvas-data.js",
  "state/main.js"
] as const;

export interface FlowWebviewHtmlOptions {
  cspSource: string;
  nonce: string;
  styleUris: readonly string[];
  scriptUris: readonly string[];
  initialState: unknown;
}

export function renderFlowWebviewHtml(options: FlowWebviewHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.cspSource}; script-src 'nonce-${options.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${options.styleUris.map((styleUri) => `<link href="${styleUri}" rel="stylesheet">`).join("\n  ")}
  <title>MindFlow</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${options.nonce}">
    window.__MINDFLOW_STATE__ = ${escapeScriptJson(options.initialState)};
  </script>
  ${options.scriptUris.map((scriptUri) => `<script nonce="${options.nonce}" src="${scriptUri}"></script>`).join("\n  ")}
</body>
</html>`;
}

export function renderFlowErrorHtml(message: string, nonce: string): string {
  return `<!DOCTYPE html>
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

export function renderFlowRestorePendingHtml(nonce: string): string {
  return `<!DOCTYPE html>
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

export function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
