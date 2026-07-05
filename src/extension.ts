import * as vscode from "vscode";
import {
  getWorkspaceRoot,
  isRealMindFlowUri,
  rememberCurrentFlowUri,
  rememberRecentFlow
} from "./extension/flowContext";
import { registerMindFlowCommands } from "./extension/mindFlowCommands";
import { MindFlowMcpServerManager } from "./mcp/server";
import { VsCodeMindFlowEditorBridge } from "./mcp/vscodeBridge";
import { FlowPanel } from "./webview/FlowPanel";
import { SidebarView } from "./webview/SidebarView";

let mcpServer: MindFlowMcpServerManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const sidebarView = new SidebarView(context, getWorkspaceRoot);
  mcpServer = new MindFlowMcpServerManager(context, new VsCodeMindFlowEditorBridge(context.extensionUri));
  void mcpServer.start();
  context.subscriptions.push(
    mcpServer,
    vscode.commands.registerCommand("mindflow.copyMcpConfig", async () => {
      try {
        if (!mcpServer) {
          throw new Error("MindFlow MCP server is not initialized.");
        }
        await mcpServer.copyClientConfig();
        vscode.window.showInformationMessage("MindFlow MCP client config copied to clipboard.");
      } catch (error) {
        vscode.window.showErrorMessage(`Copy MindFlow MCP config failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
    FlowPanel.register(context, (flowUri) => {
      rememberCurrentFlowUri(flowUri);
      if (isRealMindFlowUri(flowUri)) {
        void rememberRecentFlow(context, sidebarView, flowUri.fsPath);
      }
    }),
    vscode.window.registerWebviewViewProvider(SidebarView.viewId, sidebarView),
    ...registerMindFlowCommands(context, sidebarView)
  );
}

export function deactivate(): void {
  mcpServer?.dispose();
  mcpServer = undefined;
}
