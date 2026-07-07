import * as vscode from "vscode";
import {
  getWorkspaceRoot,
  isRealMindFlowUri,
  rememberCurrentFlowUri,
  rememberRecentFlow
} from "./extension/flowContext";
import { registerMindFlowCommands } from "./extension/mindFlowCommands";
import { registerMindFlowMcp } from "./extension/mcp/adapter";
import { FlowPanel } from "./extension/webviews/canvas/FlowPanel";
import { SidebarView } from "./extension/webviews/sidebar/SidebarView";

export function activate(context: vscode.ExtensionContext): void {
  const sidebarView = new SidebarView(context, getWorkspaceRoot);
  context.subscriptions.push(
    ...registerMindFlowMcp(context),
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

export function deactivate(): void {}
