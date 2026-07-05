import * as fs from "node:fs";
import * as vscode from "vscode";
import type { ProductFlow } from "../models/productFlow";
import { serializeProductFlow } from "../models/productFlowCodec";

export interface RenderableDocumentText {
  text: string;
  replacementText?: string;
}

export function readRenderableDocumentText(document: vscode.TextDocument, fallbackFlow?: ProductFlow): RenderableDocumentText {
  const documentText = document.getText();
  if (documentText.trim()) {
    return { text: documentText };
  }

  const replacementText = createHydratedDocumentText(document, fallbackFlow);
  if (replacementText) {
    return { text: replacementText, replacementText };
  }

  return { text: documentText };
}

export async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, text);
  return vscode.workspace.applyEdit(edit);
}

function createHydratedDocumentText(document: vscode.TextDocument, fallbackFlow?: ProductFlow): string | undefined {
  if (document.uri.scheme === "file" && document.uri.fsPath) {
    try {
      const diskText = fs.readFileSync(document.uri.fsPath, "utf8");
      if (diskText.trim()) {
        return diskText;
      }
    } catch {
      // Fall through to the normal validation error below.
    }
  }

  if (fallbackFlow) {
    return serializeProductFlow(fallbackFlow);
  }

  return undefined;
}
