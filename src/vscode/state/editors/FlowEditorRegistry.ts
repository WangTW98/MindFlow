import * as vscode from "vscode";
import type { ProductFlow } from "../../../domain/product-flow";

export interface OpenFlowEditorSession {
  uri: vscode.Uri;
  document: vscode.TextDocument;
  active: boolean;
}

export interface RenderableFlowEditorSession {
  renderWithFallback(fallbackFlow: ProductFlow): void;
  reveal(): void;
}

export class FlowEditorRegistry {
  private readonly sessions = new Map<string, RenderableFlowEditorSession>();
  private readonly documents = new Map<string, vscode.TextDocument>();
  private activeFlowKey: string | undefined;

  public setActive(flowUri: vscode.Uri): void {
    this.activeFlowKey = flowUri.toString();
  }

  public register(flowUri: vscode.Uri, document: vscode.TextDocument, session: RenderableFlowEditorSession): void {
    const key = flowUri.toString();
    this.sessions.set(key, session);
    this.documents.set(key, document);
  }

  public remove(flowUri: vscode.Uri, session: RenderableFlowEditorSession): void {
    const key = flowUri.toString();
    if (this.sessions.get(key) !== session) {
      return;
    }
    this.sessions.delete(key);
    this.documents.delete(key);
    if (this.activeFlowKey === key) {
      this.activeFlowKey = this.documents.keys().next().value;
    }
  }

  public getActiveFlowUri(): vscode.Uri | undefined {
    const activeFlowKey = this.activeFlowKey;
    return activeFlowKey ? this.documents.get(activeFlowKey)?.uri : undefined;
  }

  public getOpenEditorSessions(): OpenFlowEditorSession[] {
    return Array.from(this.documents.entries()).map(([key, document]) => ({
      uri: document.uri,
      document,
      active: key === this.activeFlowKey
    }));
  }

  public renderSession(flowUri: vscode.Uri, fallbackFlow: ProductFlow): boolean {
    const session = this.sessions.get(flowUri.toString());
    if (!session) {
      return false;
    }
    session.renderWithFallback(fallbackFlow);
    session.reveal();
    return true;
  }
}
