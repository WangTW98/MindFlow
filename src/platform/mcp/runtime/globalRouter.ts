import { randomUUID } from "node:crypto";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  MINDFLOW_AUTHORING_REFERENCE,
  MINDFLOW_AUTHORING_REFERENCE_URI,
  MINDFLOW_MODEL_REFERENCE,
  MINDFLOW_MODEL_REFERENCE_URI,
  MINDFLOW_OPERATIONS_REFERENCE,
  MINDFLOW_OPERATIONS_REFERENCE_URI,
  MINDFLOW_SERVER_INSTRUCTIONS
} from "../protocol/operationsReference";
import { MINDFLOW_MCP_TOOLS, type McpToolDefinition } from "../protocol/toolSchemas";
import { mindflowToolsetHash } from "../protocol/toolsetHash";
import {
  discoverMindFlowSessions,
  mindflowSessionDirectory,
  type MindFlowMcpSessionRecord,
  type MindFlowSessionDiscovery,
  type MindFlowWorkspaceFolderRecord,
  type UnavailableMindFlowSession
} from "./sessionRegistry";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const SESSION_CACHE_MS = 1_000;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

interface BackendState {
  endpoint: string;
  initialized: boolean;
}

interface EditorRecord extends Record<string, unknown> {
  uri: string;
  path?: string;
  displayName?: string;
  workspaceUri: string;
  workspaceName: string;
}

class RouterError extends Error {
  public constructor(public readonly code: number, message: string) {
    super(message);
  }
}

export class MindFlowGlobalRouter {
  private initializeRequested = false;
  private initialized = false;
  private cachedDiscovery: { at: number; result: MindFlowSessionDiscovery } | undefined;
  private readonly clientId = `global-router-${randomUUID()}`;
  private readonly backendStates = new Map<string, BackendState>();
  private internalRequestId = 0;

  public constructor(private readonly sessionDirectory = mindflowSessionDirectory()) {}

  public async handle(payload: unknown): Promise<Record<string, unknown> | undefined> {
    if (!isRecord(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
      return jsonRpcError(null, -32600, "Invalid JSON-RPC request.");
    }
    if ("id" in payload && !isRequestId(payload.id)) {
      return jsonRpcError(null, -32600, "JSON-RPC id must be a string or integer.");
    }
    const request = payload as unknown as JsonRpcRequest;
    if (request.id === undefined) {
      if (request.method === "notifications/initialized" || request.method === "initialized") {
        if (this.initializeRequested) this.initialized = true;
        return undefined;
      }
      return undefined;
    }
    try {
      return { jsonrpc: "2.0", id: request.id, result: await this.dispatch(request.method, request.params) };
    } catch (error) {
      return jsonRpcError(request.id, error instanceof RouterError ? error.code : -32603, errorMessage(error));
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    if (method === "initialize") {
      const input = requireRecord(params, "initialize params must be an object.");
      if (typeof input.protocolVersion !== "string" || !input.protocolVersion) {
        throw new RouterError(-32602, "initialize.protocolVersion must be a non-empty string.");
      }
      this.initializeRequested = true;
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "mindflow-global-router", version: "0.1.0" },
        instructions: `${MINDFLOW_SERVER_INSTRUCTIONS}\n\nThis is the global MindFlow Router. Discover workspaces first and use explicit flowUri values whenever multiple workspaces are active.`
      };
    }
    if (method !== "ping" && !this.initialized) {
      throw new RouterError(-32002, `MindFlow global Router must be initialized before ${method}.`);
    }
    switch (method) {
      case "ping": return {};
      case "tools/list": return { tools: globalToolDefinitions() };
      case "tools/call": return this.callTool(params);
      case "resources/list": return { resources: resourceDefinitions() };
      case "resources/read": return readResource(params);
      default: throw new RouterError(-32601, `Unsupported MCP method: ${method}`);
    }
  }

  private async callTool(params: unknown): Promise<Record<string, unknown>> {
    const request = requireRecord(params, "tools/call params must be an object.");
    const name = typeof request.name === "string" ? request.name : "";
    if (!name) throw new RouterError(-32602, "tools/call.name must be a non-empty string.");
    const args = request.arguments === undefined ? {} : requireRecord(request.arguments, "tools/call.arguments must be an object.");
    if (name === "mindflow_list_workspaces") {
      rejectUnexpectedKeys(args, []);
      return toolResult(await this.listWorkspaces());
    }
    if (name === "mindflow_get_open_editors") {
      rejectUnexpectedKeys(args, ["workspaceUri"]);
      const workspaceUri = optionalString(args.workspaceUri, "workspaceUri");
      return toolResult(await this.aggregateOpenEditors(workspaceUri));
    }
    const session = await this.selectSession(name, args);
    const forwardedArguments = { ...args };
    delete forwardedArguments.workspaceUri;
    const backendResult = await this.callBackendTool(session, name, forwardedArguments);
    return annotateBackendToolResult(backendResult, session, name);
  }

  private async listWorkspaces(): Promise<Record<string, unknown>> {
    const discovery = await this.discover(true);
    const editorCounts = new Map<string, number>();
    const aggregate = await this.aggregateOpenEditors(undefined, discovery);
    for (const editor of aggregate.editors as EditorRecord[]) {
      editorCounts.set(editor.workspaceUri, (editorCounts.get(editor.workspaceUri) ?? 0) + 1);
    }
    return {
      workspaces: discovery.sessions.flatMap((session) => session.workspaceFolders.map((folder) => ({
        workspaceUri: folder.uri,
        name: folder.name,
        focused: session.windowFocused,
        editorCount: editorCounts.get(folder.uri) ?? 0,
        extensionVersion: session.extensionVersion
      }))).sort((left, right) => left.name.localeCompare(right.name) || left.workspaceUri.localeCompare(right.workspaceUri)),
      unavailable: mergeUnavailable(discovery.unavailable, aggregate.unavailable as UnavailableMindFlowSession[])
    };
  }

  private async aggregateOpenEditors(workspaceUri?: string, knownDiscovery?: MindFlowSessionDiscovery): Promise<Record<string, unknown>> {
    const discovery = knownDiscovery ?? await this.discover(true);
    const candidates = workspaceUri ? sessionsForWorkspace(discovery.sessions, workspaceUri) : discovery.sessions;
    if (workspaceUri && candidates.length === 0) {
      throw new RouterError(-32602, workspaceNotFoundMessage(workspaceUri, discovery.sessions));
    }
    const editors: EditorRecord[] = [];
    const unavailable = [...discovery.unavailable];
    await Promise.all(candidates.map(async (session) => {
      try {
        const result = await this.callBackendTool(session, "mindflow_get_open_editors", {});
        const structured = readStructuredContent(result);
        const values = Array.isArray(structured.editors) ? structured.editors : [];
        for (const value of values) {
          if (!isRecord(value) || typeof value.uri !== "string") continue;
          const workspace = workspaceForEditor(session, value);
          if (!workspace || (workspaceUri && normalizeUri(workspace.uri) !== normalizeUri(workspaceUri))) continue;
          editors.push({ ...value, uri: value.uri, workspaceUri: workspace.uri, workspaceName: workspace.name });
        }
      } catch (error) {
        unavailable.push({
          fileName: `${session.sessionId}.json`,
          reason: errorMessage(error),
          workspaceUris: session.workspaceFolders.map((folder) => folder.uri)
        });
      }
    }));
    editors.sort((left, right) => left.workspaceName.localeCompare(right.workspaceName) ||
      String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")) || left.uri.localeCompare(right.uri));
    return { editors, unavailable: mergeUnavailable(unavailable) };
  }

  private async selectSession(toolName: string, args: Record<string, unknown>): Promise<MindFlowMcpSessionRecord> {
    const discovery = await this.discover(true);
    if (discovery.sessions.length === 0) {
      throw new RouterError(-32602, noWorkspaceMessage(discovery.unavailable));
    }
    if (toolName === "mindflow_create_flow") {
      return selectWorkspaceSession(discovery.sessions, optionalString(args.workspaceUri, "workspaceUri"));
    }
    if (toolName === "mindflow_open_flow") {
      return this.selectOpenFlowSession(discovery.sessions, args);
    }
    const flowUri = optionalString(args.flowUri, "flowUri");
    if (flowUri) {
      const aggregate = await this.aggregateOpenEditors(undefined, discovery);
      const matches = (aggregate.editors as EditorRecord[]).filter((editor) => sameFlow(editor, flowUri));
      if (matches.length !== 1) {
        const candidates = matches.map((editor) => editor.workspaceUri);
        throw new RouterError(-32602, matches.length === 0
          ? `No open MindFlow editor owns flowUri ${flowUri}. Call mindflow_get_open_editors first.`
          : `flowUri ${flowUri} is open in multiple workspaces: ${candidates.join(", ")}. Close the duplicate editor before modifying it.`);
      }
      return selectWorkspaceSession(discovery.sessions, matches[0]?.workspaceUri);
    }
    if (workspaceCount(discovery.sessions) !== 1 || discovery.sessions.length !== 1) {
      throw new RouterError(-32602, `Multiple MindFlow sessions or workspaces are active. Call mindflow_get_open_editors and repeat ${toolName} with an explicit flowUri.`);
    }
    return discovery.sessions[0] as MindFlowMcpSessionRecord;
  }

  private async selectOpenFlowSession(sessions: MindFlowMcpSessionRecord[], args: Record<string, unknown>): Promise<MindFlowMcpSessionRecord> {
    const requestedWorkspace = optionalString(args.workspaceUri, "workspaceUri");
    if (requestedWorkspace) {
      const session = selectWorkspaceSession(sessions, requestedWorkspace);
      const flowPath = requiredString(args.flowPath, "flowPath");
      const folder = workspaceFolderForUri(session, requestedWorkspace);
      if (!path.isAbsolute(flowPath)) {
        args.flowPath = path.resolve(folder.fsPath, flowPath);
      } else if (!pathContains(folder.fsPath, flowPath)) {
        throw new RouterError(-32602, `flowPath ${flowPath} is outside workspace ${requestedWorkspace}.`);
      }
      return session;
    }
    const flowPath = requiredString(args.flowPath, "flowPath");
    const openEditors = await this.aggregateOpenEditors(undefined, { sessions, unavailable: [] });
    const openMatches = (openEditors.editors as EditorRecord[]).filter((editor) => sameFlow(editor, flowPath));
    if (openMatches.length === 1) {
      return selectWorkspaceSession(sessions, openMatches[0]?.workspaceUri);
    }
    if (openMatches.length > 1) {
      throw new RouterError(-32602, `flowPath ${flowPath} is open in multiple workspaces. Close the duplicate editor or provide workspaceUri.`);
    }
    if (!path.isAbsolute(flowPath)) {
      throw new RouterError(-32602, "mindflow_open_flow requires workspaceUri when flowPath is relative.");
    }
    const normalizedPath = normalizeFsPath(flowPath);
    const matches = sessions.flatMap((session) => session.workspaceFolders
      .filter((folder) => pathContains(folder.fsPath, normalizedPath))
      .map((folder) => ({ session, length: normalizeFsPath(folder.fsPath).length })));
    if (matches.length === 0) {
      throw new RouterError(-32602, `No active workspace contains ${flowPath}. Provide workspaceUri explicitly.`);
    }
    const longest = Math.max(...matches.map((match) => match.length));
    const finalists = uniqueSessions(matches.filter((match) => match.length === longest).map((match) => match.session));
    if (finalists.length !== 1) {
      throw new RouterError(-32602, `Multiple workspaces contain ${flowPath}. Provide workspaceUri explicitly.`);
    }
    return finalists[0] as MindFlowMcpSessionRecord;
  }

  private async callBackendTool(session: MindFlowMcpSessionRecord, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.ensureBackendInitialized(session);
    const response = await postJson(session, {
      jsonrpc: "2.0", id: this.nextInternalId(), method: "tools/call", params: { name, arguments: args }
    }, this.clientId);
    if (!response) throw new Error(`MindFlow workspace ${workspaceNames(session)} returned no response.`);
    if (isRecord(response.error)) throw new Error(String(response.error.message ?? "MindFlow backend tool call failed."));
    if (!isRecord(response.result)) throw new Error("MindFlow backend returned an invalid tool result.");
    return response.result;
  }

  private async ensureBackendInitialized(session: MindFlowMcpSessionRecord): Promise<void> {
    const existing = this.backendStates.get(session.sessionId);
    if (existing?.initialized && existing.endpoint === session.endpoint) return;
    const initialize = await postJson(session, {
      jsonrpc: "2.0", id: this.nextInternalId(), method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "mindflow-global-router", version: "0.1.0" } }
    }, this.clientId);
    if (!initialize || isRecord(initialize.error)) {
      throw new Error(isRecord(initialize?.error) ? String(initialize.error.message ?? "Backend initialization failed.") : "Backend initialization returned no response.");
    }
    await postJson(session, { jsonrpc: "2.0", method: "notifications/initialized" }, this.clientId);
    this.backendStates.set(session.sessionId, { endpoint: session.endpoint, initialized: true });
  }

  private async discover(force = false): Promise<MindFlowSessionDiscovery> {
    if (!force && this.cachedDiscovery && Date.now() - this.cachedDiscovery.at < SESSION_CACHE_MS) return this.cachedDiscovery.result;
    const result = await discoverMindFlowSessions(this.sessionDirectory, mindflowToolsetHash());
    this.cachedDiscovery = { at: Date.now(), result };
    const activeIds = new Set(result.sessions.map((session) => session.sessionId));
    for (const sessionId of this.backendStates.keys()) {
      if (!activeIds.has(sessionId)) this.backendStates.delete(sessionId);
    }
    return result;
  }

  private nextInternalId(): string {
    this.internalRequestId += 1;
    return `router-${this.internalRequestId}`;
  }
}

export function runMindFlowGlobalRouter(): void {
  if (process.argv.includes("--self-test")) {
    process.stdout.write(`${JSON.stringify({ ok: true, toolsetHash: mindflowToolsetHash() })}\n`);
    return;
  }
  const router = new MindFlowGlobalRouter();
  let buffer = "";
  let processing = Promise.resolve();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    processing = processing.then(() => drain()).catch((error) => {
      process.stderr.write(`MindFlow global Router failed: ${errorMessage(error)}\n`);
    });
  });
  process.stdin.on("end", () => {
    processing = processing.then(() => drain(true)).catch((error) => {
      process.stderr.write(`MindFlow global Router failed: ${errorMessage(error)}\n`);
    });
  });

  async function drain(flush = false): Promise<void> {
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line.trim()) await handleLine(line);
    }
    if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
      buffer = "";
      throw new Error(`MCP stdio message exceeds ${MAX_MESSAGE_BYTES} bytes.`);
    }
    if (flush && buffer.trim()) {
      const line = buffer.replace(/\r$/, "");
      buffer = "";
      await handleLine(line);
    }
  }

  async function handleLine(line: string): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify(jsonRpcError(null, -32700, "Invalid JSON."))}\n`);
      return;
    }
    const response = await router.handle(payload);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

function globalToolDefinitions(): McpToolDefinition[] {
  const workspaceProperty = { workspaceUri: { type: "string", description: "Optional local VS Code workspace URI used by the global MindFlow Router." } };
  const routed = new Set(["mindflow_create_flow", "mindflow_open_flow", "mindflow_get_open_editors"]);
  return [
    {
      name: "mindflow_list_workspaces",
      description: "List local VS Code workspaces currently exposing MindFlow MCP sessions.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    ...MINDFLOW_MCP_TOOLS.map((definition) => {
      if (!routed.has(definition.name)) return definition;
      const schema = definition.inputSchema;
      const properties = isRecord(schema.properties) ? schema.properties : {};
      return { ...definition, inputSchema: { ...schema, properties: { ...properties, ...workspaceProperty } } };
    })
  ];
}

function resourceDefinitions(): Array<Record<string, string>> {
  return [
    resource(MINDFLOW_OPERATIONS_REFERENCE_URI, "MindFlow operations reference", "Operation-level workflow for reading and editing MindFlow."),
    resource(MINDFLOW_MODEL_REFERENCE_URI, "MindFlow current model", "Current root, app-surface, generic-node, state, endpoint, and edge model."),
    resource(MINDFLOW_AUTHORING_REFERENCE_URI, "MindFlow authoring rules", "Canonical edge-type and orange-outlet selection rules.")
  ];
}

function readResource(params: unknown): Record<string, unknown> {
  const request = requireRecord(params, "resources/read params must be an object.");
  const text = request.uri === MINDFLOW_OPERATIONS_REFERENCE_URI ? MINDFLOW_OPERATIONS_REFERENCE
    : request.uri === MINDFLOW_MODEL_REFERENCE_URI ? MINDFLOW_MODEL_REFERENCE
      : request.uri === MINDFLOW_AUTHORING_REFERENCE_URI ? MINDFLOW_AUTHORING_REFERENCE : undefined;
  if (!text) throw new RouterError(-32602, `Unknown MindFlow MCP resource: ${String(request.uri)}`);
  return { contents: [{ uri: request.uri, mimeType: "text/markdown", text }] };
}

function toolResult(value: Record<string, unknown>): Record<string, unknown> {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function annotateBackendToolResult(result: Record<string, unknown>, session: MindFlowMcpSessionRecord, toolName: string): Record<string, unknown> {
  if (toolName !== "mindflow_create_flow" && toolName !== "mindflow_open_flow") return result;
  const structured = readStructuredContent(result);
  if (!isRecord(structured.editor)) return result;
  const workspace = workspaceForEditor(session, structured.editor) ?? session.workspaceFolders[0];
  if (!workspace) return result;
  const next = { ...structured, editor: { ...structured.editor, workspaceUri: workspace.uri, workspaceName: workspace.name } };
  return toolResult(next);
}

function readStructuredContent(result: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(result.structuredContent)) throw new Error("MindFlow backend tool result has no structuredContent.");
  return result.structuredContent;
}

function selectWorkspaceSession(sessions: MindFlowMcpSessionRecord[], workspaceUri?: string): MindFlowMcpSessionRecord {
  if (!workspaceUri) {
    if (workspaceCount(sessions) === 1 && sessions.length === 1) return sessions[0] as MindFlowMcpSessionRecord;
    throw new RouterError(-32602, `Multiple MindFlow sessions or workspaces are active. Specify workspaceUri. Candidates: ${workspaceCandidates(sessions)}`);
  }
  const matches = sessionsForWorkspace(sessions, workspaceUri);
  if (matches.length !== 1) throw new RouterError(-32602, workspaceNotFoundMessage(workspaceUri, sessions));
  return matches[0] as MindFlowMcpSessionRecord;
}

function workspaceCount(sessions: MindFlowMcpSessionRecord[]): number {
  return new Set(sessions.flatMap((session) => session.workspaceFolders.map((folder) => normalizeUri(folder.uri)))).size;
}

function sessionsForWorkspace(sessions: MindFlowMcpSessionRecord[], workspaceUri: string): MindFlowMcpSessionRecord[] {
  const normalized = normalizeUri(workspaceUri);
  return uniqueSessions(sessions.filter((session) => session.workspaceFolders.some((folder) => normalizeUri(folder.uri) === normalized)));
}

function workspaceFolderForUri(session: MindFlowMcpSessionRecord, workspaceUri: string): MindFlowWorkspaceFolderRecord {
  const folder = session.workspaceFolders.find((candidate) => normalizeUri(candidate.uri) === normalizeUri(workspaceUri));
  if (!folder) throw new RouterError(-32602, `Workspace ${workspaceUri} is not owned by the selected MindFlow session.`);
  return folder;
}

function workspaceForEditor(session: MindFlowMcpSessionRecord, editor: Record<string, unknown>): MindFlowWorkspaceFolderRecord | undefined {
  const editorPath = typeof editor.path === "string" && path.isAbsolute(editor.path) ? normalizeFsPath(editor.path) : undefined;
  if (editorPath) {
    const matches = session.workspaceFolders.filter((folder) => pathContains(folder.fsPath, editorPath))
      .sort((left, right) => normalizeFsPath(right.fsPath).length - normalizeFsPath(left.fsPath).length);
    if (matches[0]) return matches[0];
  }
  return session.workspaceFolders[0];
}

function sameFlow(editor: EditorRecord, flowUri: string): boolean {
  if (normalizeUri(editor.uri) === normalizeUri(flowUri)) return true;
  if (editor.path && path.isAbsolute(editor.path) && path.isAbsolute(flowUri)) return normalizeFsPath(editor.path) === normalizeFsPath(flowUri);
  try {
    if (new URL(flowUri).protocol === "file:" && editor.path) return normalizeFsPath(editor.path) === normalizeFsPath(fileURLToPath(flowUri));
  } catch {
    if (path.isAbsolute(flowUri)) return normalizeUri(pathToFileURL(flowUri).toString()) === normalizeUri(editor.uri);
  }
  return false;
}

function normalizeUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "file:") return pathToFileURL(normalizeFsPath(fileURLToPath(parsed))).toString();
    return parsed.toString();
  } catch {
    return uri.trim();
  }
}

function normalizeFsPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLocaleLowerCase("en-US") : resolved;
}

function pathContains(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeFsPath(root);
  const normalizedCandidate = normalizeFsPath(candidate);
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function postJson(session: MindFlowMcpSessionRecord, payload: Record<string, unknown>, clientId: string): Promise<Record<string, unknown> | undefined> {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(session.endpoint), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.token}`,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
        "X-MindFlow-Mcp-Client": clientId
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_MESSAGE_BYTES) request.destroy(new Error(`MindFlow MCP response exceeds ${MAX_MESSAGE_BYTES} bytes.`));
        else chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8").trim();
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(text || `MindFlow MCP HTTP ${response.statusCode}`));
          return;
        }
        if (!text) resolve(undefined);
        else {
          try { resolve(JSON.parse(text) as Record<string, unknown>); }
          catch { reject(new Error("MindFlow backend returned invalid JSON.")); }
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error(`MindFlow MCP request timed out after ${REQUEST_TIMEOUT_MS}ms.`)));
    request.write(body);
    request.end();
  });
}

function resource(uri: string, name: string, description: string): Record<string, string> {
  return { uri, name, mimeType: "text/markdown", description };
}

function mergeUnavailable(...lists: UnavailableMindFlowSession[][]): UnavailableMindFlowSession[] {
  const values = lists.flat();
  return [...new Map(values.map((value) => [`${value.fileName}\u0000${value.reason}`, value])).values()]
    .sort((left, right) => left.fileName.localeCompare(right.fileName) || left.reason.localeCompare(right.reason));
}

function noWorkspaceMessage(unavailable: UnavailableMindFlowSession[]): string {
  const detail = unavailable.length ? ` Unavailable sessions: ${unavailable.map((item) => item.reason).join("; ")}` : "";
  return `No active local MindFlow workspace. Open a local folder in VS Code and ensure the MindFlow extension is active.${detail}`;
}

function workspaceNotFoundMessage(workspaceUri: string, sessions: MindFlowMcpSessionRecord[]): string {
  return `No unique active MindFlow workspace matches ${workspaceUri}. Candidates: ${workspaceCandidates(sessions) || "none"}`;
}

function workspaceCandidates(sessions: MindFlowMcpSessionRecord[]): string {
  return sessions.flatMap((session) => session.workspaceFolders.map((folder) => folder.uri)).sort().join(", ");
}

function workspaceNames(session: MindFlowMcpSessionRecord): string {
  return session.workspaceFolders.map((folder) => folder.name).join(", ");
}

function uniqueSessions(sessions: MindFlowMcpSessionRecord[]): MindFlowMcpSessionRecord[] {
  return [...new Map(sessions.map((session) => [session.sessionId, session])).values()];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new RouterError(-32602, `${field} must be a non-empty string.`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) throw new RouterError(-32602, `Unexpected tool argument(s): ${unexpected.join(", ")}.`);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new RouterError(-32602, message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isInteger(value));
}

function jsonRpcError(id: string | number | null, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
