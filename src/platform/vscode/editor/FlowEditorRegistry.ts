import type * as vscode from "vscode";
import type { ProductFlow } from "../../../product-flow/domain";
import type { FlowSelectionState } from "../../../product-flow/domain/selection";

export interface OpenFlowEditorSession {
  uri: vscode.Uri;
  document: vscode.TextDocument;
  active: boolean;
}

export interface RenderableFlowEditorSession {
  renderWithFallback(fallbackFlow: ProductFlow): void;
  applySelection(selection: FlowSelectionState): void;
  reveal(): void;
}

interface FlowEditorEntry {
  document: vscode.TextDocument;
  sessions: Set<RenderableFlowEditorSession>;
}

export class FlowEditorRegistry {
  private readonly entries = new Map<string, FlowEditorEntry>();
  private activeFlowKey: string | undefined;

  public setActive(flowUri: vscode.Uri): void {
    this.activeFlowKey = flowUri.toString();
  }

  public register(flowUri: vscode.Uri, document: vscode.TextDocument, session: RenderableFlowEditorSession): void {
    const key = flowUri.toString();
    const entry = this.entries.get(key) ?? { document, sessions: new Set<RenderableFlowEditorSession>() };
    entry.document = document;
    entry.sessions.add(session);
    this.entries.set(key, entry);
  }

  public remove(flowUri: vscode.Uri, session: RenderableFlowEditorSession): boolean {
    const key = flowUri.toString();
    const entry = this.entries.get(key);
    if (!entry || !entry.sessions.delete(session)) {
      return false;
    }
    if (entry.sessions.size > 0) {
      return false;
    }
    this.entries.delete(key);
    if (this.activeFlowKey === key) {
      this.activeFlowKey = this.entries.keys().next().value;
    }
    return true;
  }

  public getActiveFlowUri(): vscode.Uri | undefined {
    const activeFlowKey = this.activeFlowKey;
    return activeFlowKey ? this.entries.get(activeFlowKey)?.document.uri : undefined;
  }

  public getOpenEditorSessions(): OpenFlowEditorSession[] {
    return Array.from(this.entries.entries()).map(([key, entry]) => ({
      uri: entry.document.uri,
      document: entry.document,
      active: key === this.activeFlowKey
    }));
  }

  public hasSession(flowUri: vscode.Uri): boolean {
    return (this.entries.get(flowUri.toString())?.sessions.size ?? 0) > 0;
  }

  public applySelection(flowUri: vscode.Uri | string, selection: FlowSelectionState): void {
    const key = typeof flowUri === "string" ? flowUri : flowUri.toString();
    for (const session of this.entries.get(key)?.sessions ?? []) {
      session.applySelection(selection);
    }
  }

  public renderSession(flowUri: vscode.Uri, fallbackFlow: ProductFlow): boolean {
    const sessions = this.entries.get(flowUri.toString())?.sessions;
    if (!sessions || sessions.size === 0) {
      return false;
    }
    let first = true;
    for (const session of sessions) {
      session.renderWithFallback(fallbackFlow);
      if (first) {
        session.reveal();
        first = false;
      }
    }
    return true;
  }
}
