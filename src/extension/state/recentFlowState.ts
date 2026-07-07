import * as vscode from "vscode";
import { RecentFlowStore } from "./recentFlows";
import { rememberFlowPath } from "./activeFlowState";

export interface RefreshableSidebar {
  refresh(): Promise<void>;
}

export async function rememberRecentFlow(
  context: vscode.ExtensionContext,
  sidebarView: RefreshableSidebar | undefined,
  flowPath: string
): Promise<void> {
  rememberFlowPath(flowPath);
  await new RecentFlowStore(context.globalState).add(flowPath);
  void sidebarView?.refresh();
}
