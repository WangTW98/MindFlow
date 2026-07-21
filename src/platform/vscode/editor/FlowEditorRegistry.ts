import type * as vscode from "vscode";
import type { ProductFlow } from "../../../product-flow/domain";
import type { FlowSelectionState } from "../../../product-flow/domain/selection";
import type { MindFlowAutoLayoutPreview, MindFlowRevealTarget } from "../../mcp/protocol/bridge";
import { canonicalFileKey } from "../../../shared/canonicalFileKey";

export interface OpenFlowEditorSession {
  uri: vscode.Uri;
  document: vscode.TextDocument;
  active: boolean;
}

export interface RenderableFlowEditorSession {
  renderWithFallback(fallbackFlow: ProductFlow): void;
  applySelection(selection: FlowSelectionState): void;
  requestAutoLayout?(): Promise<MindFlowAutoLayoutPreview>;
  revealEntities?(targets: MindFlowRevealTarget[], animate?: boolean): void;
  reveal(): void;
}

interface FlowEditorEntry {
  document: vscode.TextDocument;
  sessions: Set<RenderableFlowEditorSession>;
}

export class FlowEditorRegistry {
  private readonly entries = new Map<string, FlowEditorEntry>();
  private readonly aliasMap = new Map<string, vscode.Uri>();
  private activeFlowKey: string | undefined;

  public setActive(flowUri: vscode.Uri): void {
    this.activeFlowKey = canonicalFileKey(flowUri);
  }

  public register(flowUri: vscode.Uri, document: vscode.TextDocument, session: RenderableFlowEditorSession): void {
    const key = canonicalFileKey(flowUri);
    const entry = this.entries.get(key) ?? { document, sessions: new Set<RenderableFlowEditorSession>() };
    entry.document = document;
    entry.sessions.add(session);
    this.entries.set(key, entry);
  }

  public handleDocumentSave(oldUri: vscode.Uri, newUri: vscode.Uri): void {
    const oldKey = canonicalFileKey(oldUri);
    const newKey = canonicalFileKey(newUri);
    const entry = this.entries.get(oldKey);
    if (entry) {
      this.entries.delete(oldKey);
      this.entries.set(newKey, entry);
      this.aliasMap.set(oldKey, newUri);
      if (this.activeFlowKey === oldKey) {
        this.activeFlowKey = newKey;
      }
    }
  }

  public remove(flowUri: vscode.Uri, session: RenderableFlowEditorSession): boolean {
    const key = canonicalFileKey(flowUri);
    const entry = this.entries.get(key);
    if (!entry || !entry.sessions.delete(session)) {
      return false;
    }
    if (entry.sessions.size > 0) {
      return false;
    }
    this.entries.delete(key);
    this.aliasMap.delete(key);
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
    const key = canonicalFileKey(flowUri);
    return (this.entries.get(key)?.sessions.size ?? 0) > 0 || (this.aliasMap.has(key) && (this.entries.get(canonicalFileKey(this.aliasMap.get(key)!))?.sessions.size ?? 0) > 0);
  }

  public getOpenFlowUri(flowUri: vscode.Uri): vscode.Uri | undefined {
    const key = canonicalFileKey(flowUri);
    const directMatch = this.entries.get(key)?.document.uri;
    if (directMatch) return directMatch;
    const aliased = this.aliasMap.get(key);
    return aliased ? this.entries.get(canonicalFileKey(aliased))?.document.uri : undefined;
  }

  public revealSession(flowUri: vscode.Uri): boolean {
    const session = this.entries.get(canonicalFileKey(flowUri))?.sessions.values().next().value;
    if (!session) return false;
    session.reveal();
    return true;
  }

  public applySelection(flowUri: vscode.Uri | string, selection: FlowSelectionState): void {
    const key = canonicalFileKey(flowUri);
    for (const session of this.entries.get(key)?.sessions ?? []) {
      session.applySelection(selection);
    }
  }

  public requestAutoLayout(flowUri: vscode.Uri | string): Promise<MindFlowAutoLayoutPreview> {
    const session = this.entries.get(canonicalFileKey(flowUri))?.sessions.values().next().value;
    if (!session?.requestAutoLayout) throw new Error("MindFlow auto layout requires an open canvas webview.");
    return session.requestAutoLayout();
  }

  public revealEntities(flowUri: vscode.Uri | string, targets: MindFlowRevealTarget[], animate?: boolean): boolean {
    const sessions = this.entries.get(canonicalFileKey(flowUri))?.sessions;
    if (!sessions || sessions.size === 0) return false;
    for (const session of sessions) session.revealEntities?.(targets, animate);
    sessions.values().next().value?.reveal();
    return true;
  }

  public renderSession(flowUri: vscode.Uri, fallbackFlow: ProductFlow): boolean {
    const sessions = this.entries.get(canonicalFileKey(flowUri))?.sessions;
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
