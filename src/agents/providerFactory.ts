import * as vscode from "vscode";
import type { AgentProvider, HttpAgentConfig } from "./AgentProvider";
import { CodexProvider } from "./CodexProvider";
import { GeminiProvider } from "./GeminiProvider";
import { MockProvider } from "./MockProvider";

export async function createAgentProvider(context: vscode.ExtensionContext): Promise<AgentProvider> {
  const config = vscode.workspace.getConfiguration("mindflow.agent");
  const provider = config.get<"mock" | "codex" | "gemini">("provider", "mock");
  if (provider === "mock") {
    return new MockProvider();
  }

  const httpConfig: HttpAgentConfig = {
    endpoint: config.get<string>("endpoint", ""),
    model: config.get<string>("model", ""),
    apiKey: await context.secrets.get(secretKey(provider)),
    codexCliPath: config.get<string>("codexCliPath", "codex"),
    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    debugDirectory: vscode.workspace.workspaceFolders?.[0]
      ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, ".mindflow", "debug").fsPath
      : undefined
  };

  if (provider === "codex") {
    return new CodexProvider(httpConfig);
  }
  return new GeminiProvider(httpConfig);
}

export async function configureAgent(context: vscode.ExtensionContext): Promise<void> {
  const selected = await vscode.window.showQuickPick(["mock", "codex", "gemini"], {
    title: "MindFlow AI Agent Provider"
  });
  if (!selected) {
    return;
  }
  await vscode.workspace.getConfiguration("mindflow.agent").update("provider", selected, vscode.ConfigurationTarget.Workspace);
  if (selected === "mock") {
    vscode.window.showInformationMessage("MindFlow provider set to mock.");
    return;
  }

  const endpoint = await vscode.window.showInputBox({
    title: `${selected} endpoint`,
    prompt: "HTTP endpoint for structured JSON calls",
    ignoreFocusOut: true
  });
  if (endpoint !== undefined) {
    await vscode.workspace.getConfiguration("mindflow.agent").update("endpoint", endpoint, vscode.ConfigurationTarget.Workspace);
  }
  const model = await vscode.window.showInputBox({
    title: `${selected} model`,
    prompt: "Provider-specific model name",
    ignoreFocusOut: true
  });
  if (model !== undefined) {
    await vscode.workspace.getConfiguration("mindflow.agent").update("model", model, vscode.ConfigurationTarget.Workspace);
  }
  const apiKey = await vscode.window.showInputBox({
    title: `${selected} API key`,
    prompt: "Stored in VSCode SecretStorage",
    password: true,
    ignoreFocusOut: true
  });
  if (apiKey) {
    await context.secrets.store(secretKey(selected), apiKey);
  }
  vscode.window.showInformationMessage(`MindFlow provider set to ${selected}.`);
}

function secretKey(provider: string): string {
  return `mindflow.agent.${provider}.apiKey`;
}
