import * as vscode from "vscode";
import {
  getWorkspaceRoot,
  isRealMindFlowUri,
  rememberCurrentFlowUri,
  rememberRecentFlow
} from "./flowContext";
import { registerMindFlowCommands } from "./mindFlowCommands";
import { registerMindFlowMcp } from "../mcp/vscode/adapter";
import { FlowPanel } from "./webviews/canvas/FlowPanel";
import { SidebarView } from "./webviews/sidebar/SidebarView";

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
