import * as vscode from "vscode";
import { RecentFlowStore } from "../state/recentFlows";
import { parseSidebarMessage } from "../../webview/protocol/sidebarMessages";
import { renderSidebarHtml } from "./sidebarHtml";
import { createSidebarState } from "./sidebarState";

export class SidebarView implements vscode.WebviewViewProvider {
  public static readonly viewId = "mindflow.sidebar";

  private readonly recentFlows: RecentFlowStore;
  private webviewView: vscode.WebviewView | undefined;

  public constructor(private readonly context: vscode.ExtensionContext, private readonly getWorkspaceRoot: () => string | undefined) {
    this.recentFlows = new RecentFlowStore(context.globalState);
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "assets", "webview", "sidebar", "media")]
    };
    webviewView.webview.html = await this.render(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (rawMessage: unknown) => {
      const message = parseSidebarMessage(rawMessage);
      if (!message) {
        console.warn("Ignored invalid MindFlow sidebar message", rawMessage);
        return;
      }
      switch (message.type) {
        case "newMindFlow":
          await vscode.commands.executeCommand("mindflow.newFlow");
          break;
        case "openMindFlow":
          await vscode.commands.executeCommand("mindflow.openFlow");
          break;
        case "openFlow":
          await vscode.commands.executeCommand("mindflow.openFlow", message.flowPath);
          break;
        case "clearRecent":
          await this.recentFlows.clear();
          await this.refresh();
          break;
        case "removeRecent":
          await this.recentFlows.remove(message.flowPath);
          await this.refresh();
          break;
        default:
          break;
      }
    });
  }

  public async refresh(): Promise<void> {
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.html = await this.render(this.webviewView.webview);
  }

  private async render(webview: vscode.Webview): Promise<string> {
    const state = await createSidebarState({
      getWorkspaceRoot: this.getWorkspaceRoot,
      recentFlows: this.recentFlows
    });
    return renderSidebarHtml({
      extensionUri: this.context.extensionUri,
      webview,
      state
    });
  }
}
