const vscode = acquireVsCodeApi();
const state = window.__MINDFLOW_STATE__;
const app = requireElementById("app");
const persisted = vscode.getState() || {};

window.addEventListener("message", (event) => {
  handleHostMessage(event.data);
});
