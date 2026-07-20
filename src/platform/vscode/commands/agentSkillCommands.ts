import * as vscode from "vscode";

export async function exportAgentSkills(context: vscode.ExtensionContext): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Export MindFlow Agent Skills"
  });
  const destinationRoot = selected?.[0];
  if (!destinationRoot) return;
  const source = vscode.Uri.joinPath(context.extensionUri, "agent-assets", "skills");
  const destination = vscode.Uri.joinPath(destinationRoot, "mindflow-agent-skills");
  let destinationExists = false;
  try {
    await vscode.workspace.fs.stat(destination);
    destinationExists = true;
  } catch (error) {
    if (!(error instanceof vscode.FileSystemError) || error.code !== "FileNotFound") throw error;
  }
  if (destinationExists) {
    const answer = await vscode.window.showWarningMessage(
      `MindFlow Agent Skills already exist at ${destination.fsPath || destination.toString()}. Replace them with this extension version?`,
      { modal: true },
      "Replace"
    );
    if (answer !== "Replace") return;
    await vscode.workspace.fs.delete(destination, { recursive: true, useTrash: false });
  }
  await vscode.workspace.fs.copy(source, destination, { overwrite: true });
  await vscode.window.showInformationMessage(`MindFlow Agent Skills exported to ${destination.fsPath || destination.toString()}.`);
}
