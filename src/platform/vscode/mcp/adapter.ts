import * as vscode from "vscode";
import { MindFlowMcpServerManager } from "./server";
import { VsCodeMindFlowEditorBridge } from "./vscodeBridge";

export function registerMindFlowMcp(context: vscode.ExtensionContext): vscode.Disposable[] {
  const mcpServer = new MindFlowMcpServerManager(context, new VsCodeMindFlowEditorBridge(context.extensionUri));
  void mcpServer.start();
  return [mcpServer];
}
