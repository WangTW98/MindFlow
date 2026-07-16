import * as vscode from "vscode";
import { MindFlowGlobalRuntimeManager } from "./globalRuntime";
import { MindFlowMcpServerManager } from "./server";
import { VsCodeMindFlowEditorBridge } from "./vscodeBridge";

export function registerMindFlowMcp(context: vscode.ExtensionContext): vscode.Disposable[] {
  const output = vscode.window.createOutputChannel("MindFlow MCP");
  const log = (level: "info" | "warn" | "error", message: string): void => {
    output.appendLine(`${new Date().toISOString()} [${level.toUpperCase()}] ${message}`);
  };
  const mcpServer = new MindFlowMcpServerManager(context, new VsCodeMindFlowEditorBridge(context.extensionUri), log);
  const runtime = new MindFlowGlobalRuntimeManager(context);
  void mcpServer.start();
  void runtime.ensureInstalled()
    .then((installation) => log("info", `Global Router verified at ${installation.routerPath}.`))
    .catch((error) => log("error", `Global Router installation failed: ${errorMessage(error)}`));
  return [
    mcpServer,
    output,
    vscode.commands.registerCommand("mindflow.copyGlobalMcpConfig", async () => {
      try {
        await mcpServer.ensureStarted();
        const config = await runtime.buildGlobalConfig();
        await vscode.env.clipboard.writeText(JSON.stringify(config, null, 2));
        await vscode.window.showInformationMessage("MindFlow global MCP configuration copied. Add it to your Agent's global MCP configuration, then refresh MCP servers.");
      } catch (error) {
        log("error", `Unable to copy global MCP configuration: ${errorMessage(error)}`);
        await vscode.window.showErrorMessage(`Unable to copy MindFlow global MCP configuration: ${errorMessage(error)}`);
      }
    }),
    vscode.commands.registerCommand("mindflow.showMcpConnectionStatus", async () => {
      try {
        await mcpServer.ensureStarted();
        const status = await runtime.status();
        output.appendLine(`${new Date().toISOString()} [INFO] MindFlow MCP connection status`);
        output.appendLine(JSON.stringify(status, null, 2));
        output.show(true);
      } catch (error) {
        log("error", `Unable to read MCP status: ${errorMessage(error)}`);
        await vscode.window.showErrorMessage(`Unable to read MindFlow MCP status: ${errorMessage(error)}`);
      }
    })
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
