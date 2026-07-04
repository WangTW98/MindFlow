declare type Thenable<T> = Promise<T>;

declare module "vscode" {
  export interface Disposable {
    dispose(): unknown;
  }

  export interface ExtensionContext {
    subscriptions: { push(...items: Disposable[]): void };
    extensionUri: Uri;
    secrets: {
      get(key: string): Thenable<string | undefined>;
      store(key: string, value: string): Thenable<void>;
    };
  }

  export class Uri {
    fsPath: string;
    static file(path: string): Uri;
    static joinPath(base: Uri, ...pathSegments: string[]): Uri;
    toString(): string;
  }

  export class Position {
    constructor(line: number, character: number);
  }

  export class Range {
    constructor(start: Position, end: Position);
  }

  export class WorkspaceEdit {
    replace(uri: Uri, range: Range, newText: string): void;
  }

  export enum ViewColumn {
    One = 1,
    Beside = -2
  }

  export enum ProgressLocation {
    Notification = 15
  }

  export enum ConfigurationTarget {
    Workspace = 5
  }

  export interface WorkspaceFolder {
    uri: Uri;
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string, defaultValue: T): T;
    update(section: string, value: unknown, target?: ConfigurationTarget): Thenable<void>;
  }

  export interface Selection {
    isEmpty: boolean;
  }

  export interface TextDocument {
    isUntitled: boolean;
    uri: Uri;
    getText(selection?: Selection): string;
    positionAt(offset: number): Position;
  }

  export interface TextEditor {
    document: TextDocument;
    selection: Selection;
    viewColumn?: ViewColumn;
  }

  export interface OpenDialogOptions {
    title?: string;
    canSelectFiles?: boolean;
    canSelectFolders?: boolean;
    canSelectMany?: boolean;
    filters?: Record<string, string[]>;
  }

  export interface QuickPickItem {
    label: string;
    description?: string;
  }

  export interface InputBoxOptions {
    title?: string;
    prompt?: string;
    password?: boolean;
    ignoreFocusOut?: boolean;
  }

  export interface Webview {
    html: string;
    cspSource: string;
    options: {
      enableScripts?: boolean;
      localResourceRoots?: Uri[];
    };
    asWebviewUri(uri: Uri): Uri;
    onDidReceiveMessage(listener: (message: any) => any): Disposable;
  }

  export interface WebviewPanel {
    webview: Webview;
    reveal(column?: ViewColumn): void;
    onDidDispose(listener: () => any): Disposable;
  }

  export interface WebviewView {
    webview: Webview;
  }

  export interface WebviewViewProvider {
    resolveWebviewView(webviewView: WebviewView): void | Thenable<void>;
  }

  export interface CancellationToken {
    isCancellationRequested: boolean;
  }

  export interface TextDocumentChangeEvent {
    document: TextDocument;
  }

  export interface CustomTextEditorProvider {
    resolveCustomTextEditor(document: TextDocument, webviewPanel: WebviewPanel, token: CancellationToken): void | Thenable<void>;
  }

  export namespace workspace {
    const workspaceFolders: readonly WorkspaceFolder[] | undefined;
    function getConfiguration(section?: string): WorkspaceConfiguration;
    function asRelativePath(pathOrUri: string | Uri, includeWorkspaceFolder?: boolean): string;
    function openTextDocument(options: { content: string; language?: string }): Thenable<TextDocument>;
    function openTextDocument(path: string): Thenable<TextDocument>;
    function applyEdit(edit: WorkspaceEdit): Thenable<boolean>;
    function onDidChangeTextDocument(listener: (event: TextDocumentChangeEvent) => any): Disposable;
  }

  export namespace window {
    const activeTextEditor: TextEditor | undefined;
    function createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: ViewColumn,
      options?: {
        enableScripts?: boolean;
        retainContextWhenHidden?: boolean;
        localResourceRoots?: Uri[];
      }
    ): WebviewPanel;
    function registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable;
    function registerCustomEditorProvider(
      viewType: string,
      provider: CustomTextEditorProvider,
      options?: {
        webviewOptions?: {
          retainContextWhenHidden?: boolean;
        };
      }
    ): Disposable;
    function showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    function showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    function showWarningMessage(message: string, options: { modal?: boolean }, ...items: string[]): Thenable<string | undefined>;
    function showErrorMessage(message: string): Thenable<string | undefined>;
    function showInputBox(options?: InputBoxOptions): Thenable<string | undefined>;
    function showOpenDialog(options?: OpenDialogOptions): Thenable<Uri[] | undefined>;
    function showTextDocument(document: TextDocument, column?: ViewColumn): Thenable<TextEditor>;
    function showQuickPick(items: readonly string[], options?: { title?: string }): Thenable<string | undefined>;
    function showQuickPick<T extends QuickPickItem>(items: readonly T[], options?: { title?: string }): Thenable<T | undefined>;
    function withProgress<T>(
      options: { location: ProgressLocation; title?: string },
      task: () => Thenable<T> | Promise<T>
    ): Thenable<T>;
  }

  export namespace commands {
    function registerCommand(command: string, callback: (...args: any[]) => any): Disposable;
    function executeCommand<T = unknown>(command: string, ...rest: any[]): Thenable<T>;
  }
}
