import * as vscode from "vscode";
import { getWorkspaceRoot, isRealMindFlowUri } from "./documents/flowUri";
import { rememberCurrentFlowUri } from "./state/activeFlowState";
import { rememberRecentFlow } from "./state/recentFlowState";
import { registerMindFlowCommands } from "./commands/registerMindFlowCommands";
import { registerMindFlowMcp } from "./mcp/adapter";
import { FlowPanel } from "./editor/canvas/FlowPanel";
import { SidebarView } from "./sidebar/SidebarView";

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
