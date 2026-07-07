import * as vscode from "vscode";
import { MindFlowMcpServerManager } from "./server";
import { VsCodeMindFlowEditorBridge } from "./vscodeBridge";

export function registerMindFlowMcp(context: vscode.ExtensionContext): vscode.Disposable[] {
  const mcpServer = new MindFlowMcpServerManager(context, new VsCodeMindFlowEditorBridge(context.extensionUri));
  void mcpServer.start();
  return [
    mcpServer,
    vscode.commands.registerCommand("mindflow.copyMcpConfig", async () => {
      try {
        await mcpServer.copyClientConfig();
        vscode.window.showInformationMessage("MindFlow MCP client config copied to clipboard.");
      } catch (error) {
        vscode.window.showErrorMessage(`Copy MindFlow MCP config failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  ];
}
