import { randomUUID } from "node:crypto";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertAbsoluteLocalMindFlowPath } from "../../../shared/localMindFlowPath";
import { mindflowMcpContractHash } from "../protocol/contractHash";
import { mindflowGlobalToolDefinitions } from "../protocol/globalToolSchemas";
import {
  MINDFLOW_AUTHORING_REFERENCE,
  MINDFLOW_AUTHORING_REFERENCE_URI,
  MINDFLOW_MODEL_REFERENCE,
  MINDFLOW_MODEL_REFERENCE_URI,
  MINDFLOW_OPERATIONS_REFERENCE,
  MINDFLOW_OPERATIONS_REFERENCE_URI,
  MINDFLOW_SERVER_INSTRUCTIONS
} from "../protocol/operationsReference";
import { MINDFLOW_MCP_TOOLS } from "../protocol/toolSchemas";
import {
  discoverMindFlowSessions,
  mindflowSessionDirectory,
  type MindFlowMcpHostRecord,
  type MindFlowSessionDiscovery,
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
  hostId: string;
  hostName: string;
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
        instructions: `${MINDFLOW_SERVER_INSTRUCTIONS}\n\nThis global Router discovers local VS Code hosts. Call mindflow_list_hosts and mindflow_get_open_editors first. Prefer flowUri for precise operations; use hostId to override recent-focus routing.`
      };
    }
    if (method !== "ping" && !this.initialized) {
      throw new RouterError(-32002, `MindFlow global Router must be initialized before ${method}.`);
    }
    switch (method) {
      case "ping": return {};
      case "tools/list": return { tools: mindflowGlobalToolDefinitions() };
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
    if (name === "mindflow_list_hosts") {
      rejectUnexpectedKeys(args, []);
      return toolResult(await this.listHosts());
    }
    if (name === "mindflow_get_open_editors") {
      rejectUnexpectedKeys(args, ["hostId"]);
      return toolResult(await this.aggregateOpenEditors(optionalString(args.hostId, "hostId")));
    }
    const host = await this.selectHost(name, args);
    const forwardedArguments = { ...args };
    delete forwardedArguments.hostId;
    const backendResult = await this.callBackendTool(host, name, forwardedArguments);
    return annotateBackendToolResult(backendResult, host, name);
  }

  private async listHosts(): Promise<Record<string, unknown>> {
    const discovery = await this.discover(true);
    const aggregate = await this.aggregateOpenEditors(undefined, discovery);
    const editorCounts = new Map<string, number>();
    for (const editor of aggregate.editors as EditorRecord[]) {
      editorCounts.set(editor.hostId, (editorCounts.get(editor.hostId) ?? 0) + 1);
    }
    return {
      hosts: discovery.sessions.map((host) => ({
        hostId: host.hostId,
        displayName: host.displayName,
        focused: host.windowFocused,
        lastFocusedAt: host.lastFocusedAt,
        openEditorCount: editorCounts.get(host.hostId) ?? 0,
        extensionVersion: host.extensionVersion
      })).sort(compareHostsForDisplay),
      unavailable: mergeUnavailable(discovery.unavailable, aggregate.unavailable as UnavailableMindFlowSession[])
    };
  }

  private async aggregateOpenEditors(hostId?: string, knownDiscovery?: MindFlowSessionDiscovery): Promise<Record<string, unknown>> {
    const discovery = knownDiscovery ?? await this.discover(true);
    const candidates = hostId ? [requireHost(discovery.sessions, hostId)] : discovery.sessions;
    const editors: EditorRecord[] = [];
    const unavailable = [...discovery.unavailable];
    await Promise.all(candidates.map(async (host) => {
      try {
        const result = await this.callBackendTool(host, "mindflow_get_open_editors", {});
        const structured = readStructuredContent(result);
        const values = Array.isArray(structured.editors) ? structured.editors : [];
        for (const value of values) {
          if (!isRecord(value) || typeof value.uri !== "string") continue;
          editors.push({ ...value, uri: value.uri, hostId: host.hostId, hostName: host.displayName });
        }
      } catch (error) {
        unavailable.push({ fileName: `${host.hostId}.json`, reason: errorMessage(error), hostId: host.hostId });
      }
    }));
    editors.sort((left, right) => left.hostName.localeCompare(right.hostName) ||
      String(left.displayName ?? "").localeCompare(String(right.displayName ?? "")) || left.uri.localeCompare(right.uri));
    return { editors, unavailable: mergeUnavailable(unavailable) };
  }

  private async selectHost(toolName: string, args: Record<string, unknown>): Promise<MindFlowMcpHostRecord> {
    const discovery = await this.discover(true);
    if (discovery.sessions.length === 0) throw new RouterError(-32602, noHostMessage(discovery.unavailable));
    const hostId = optionalString(args.hostId, "hostId");
    if (toolName === "mindflow_open_flow") return this.selectOpenFlowHost(discovery, args, hostId);

    const flowUri = optionalString(args.flowUri, "flowUri");
    if (flowUri) return this.selectHostForOpenFlow(discovery, flowUri, hostId, "flowUri", toolIsReadOnly(toolName));
    if (hostId) return requireHost(discovery.sessions, hostId);
    return preferredHost(discovery.sessions);
  }

  private async selectOpenFlowHost(
    discovery: MindFlowSessionDiscovery,
    args: Record<string, unknown>,
    hostId?: string
  ): Promise<MindFlowMcpHostRecord> {
    const flowPath = requiredString(args.flowPath, "flowPath");
    try {
      args.flowPath = assertAbsoluteLocalMindFlowPath(flowPath);
    } catch (error) {
      throw new RouterError(-32602, errorMessage(error));
    }
    const aggregate = await this.aggregateOpenEditors(undefined, discovery);
    const matches = (aggregate.editors as EditorRecord[]).filter((editor) => sameFlow(editor, flowPath));
    if (matches.length > 0) return resolveEditorHost(discovery.sessions, matches, hostId, flowPath, false);
    if (hostId) return requireHost(discovery.sessions, hostId);
    return preferredHost(discovery.sessions);
  }

  private async selectHostForOpenFlow(
    discovery: MindFlowSessionDiscovery,
    flowUri: string,
    hostId: string | undefined,
    label: string,
    readOnly: boolean
  ): Promise<MindFlowMcpHostRecord> {
    const aggregate = await this.aggregateOpenEditors(undefined, discovery);
    const matches = (aggregate.editors as EditorRecord[]).filter((editor) => sameFlow(editor, flowUri));
    if (matches.length === 0) {
      throw new RouterError(-32602, `No open MindFlow editor owns ${label} ${flowUri}. Call mindflow_get_open_editors first.`);
    }
    return resolveEditorHost(discovery.sessions, matches, hostId, flowUri, readOnly);
  }

  private async callBackendTool(host: MindFlowMcpHostRecord, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.ensureBackendInitialized(host);
    const response = await postJson(host, {
      jsonrpc: "2.0", id: this.nextInternalId(), method: "tools/call", params: { name, arguments: args }
    }, this.clientId);
    if (!response) throw new Error(`MindFlow host ${host.displayName} returned no response.`);
    if (isRecord(response.error)) throw new Error(String(response.error.message ?? "MindFlow backend tool call failed."));
    if (!isRecord(response.result)) throw new Error("MindFlow backend returned an invalid tool result.");
    return response.result;
  }

  private async ensureBackendInitialized(host: MindFlowMcpHostRecord): Promise<void> {
    const existing = this.backendStates.get(host.hostId);
    if (existing?.initialized && existing.endpoint === host.endpoint) return;
    const initialize = await postJson(host, {
      jsonrpc: "2.0", id: this.nextInternalId(), method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "mindflow-global-router", version: "0.1.0" } }
    }, this.clientId);
    if (!initialize || isRecord(initialize.error)) {
      throw new Error(isRecord(initialize?.error) ? String(initialize.error.message ?? "Backend initialization failed.") : "Backend initialization returned no response.");
    }
    await postJson(host, { jsonrpc: "2.0", method: "notifications/initialized" }, this.clientId);
    this.backendStates.set(host.hostId, { endpoint: host.endpoint, initialized: true });
  }

  private async discover(force = false): Promise<MindFlowSessionDiscovery> {
    if (!force && this.cachedDiscovery && Date.now() - this.cachedDiscovery.at < SESSION_CACHE_MS) return this.cachedDiscovery.result;
    const result = await discoverMindFlowSessions(this.sessionDirectory, mindflowMcpContractHash());
    this.cachedDiscovery = { at: Date.now(), result };
    const activeIds = new Set(result.sessions.map((host) => host.hostId));
    for (const hostId of this.backendStates.keys()) {
      if (!activeIds.has(hostId)) this.backendStates.delete(hostId);
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
    process.stdout.write(`${JSON.stringify({ ok: true, contractHash: mindflowMcpContractHash() })}\n`);
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

function annotateBackendToolResult(result: Record<string, unknown>, host: MindFlowMcpHostRecord, toolName: string): Record<string, unknown> {
  if (toolName !== "mindflow_create_flow" && toolName !== "mindflow_open_flow") return result;
  const structured = readStructuredContent(result);
  if (!isRecord(structured.editor)) return result;
  return toolResult({ ...structured, editor: { ...structured.editor, hostId: host.hostId, hostName: host.displayName } });
}

function readStructuredContent(result: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(result.structuredContent)) throw new Error("MindFlow backend tool result has no structuredContent.");
  return result.structuredContent;
}

function resolveEditorHost(
  hosts: MindFlowMcpHostRecord[],
  matches: EditorRecord[],
  requestedHostId: string | undefined,
  flowReference: string,
  allowExplicitDuplicate: boolean
): MindFlowMcpHostRecord {
  const uniqueHostIds = [...new Set(matches.map((editor) => editor.hostId))];
  if (uniqueHostIds.length > 1 && (!requestedHostId || !allowExplicitDuplicate)) {
    throw new RouterError(-32602, `${flowReference} is open in multiple MindFlow hosts: ${uniqueHostIds.join(", ")}. Close the duplicate editor before modifying it.`);
  }
  if (requestedHostId) {
    requireHost(hosts, requestedHostId);
    if (!uniqueHostIds.includes(requestedHostId)) {
      throw new RouterError(-32602, `hostId ${requestedHostId} does not own ${flowReference}. Candidate hosts: ${uniqueHostIds.join(", ")}.`);
    }
    return requireHost(hosts, requestedHostId);
  }
  return requireHost(hosts, uniqueHostIds[0] as string);
}

function toolIsReadOnly(toolName: string): boolean {
  return MINDFLOW_MCP_TOOLS.find((tool) => tool.name === toolName)?.annotations?.readOnlyHint === true;
}

function requireHost(hosts: MindFlowMcpHostRecord[], hostId: string): MindFlowMcpHostRecord {
  const match = hosts.find((host) => host.hostId === hostId);
  if (!match) throw new RouterError(-32602, `No active MindFlow host matches hostId ${hostId}. Candidates: ${hostCandidates(hosts) || "none"}.`);
  return match;
}

function preferredHost(hosts: MindFlowMcpHostRecord[]): MindFlowMcpHostRecord {
  const sorted = [...hosts].sort((left, right) => {
    if (left.windowFocused !== right.windowFocused) return left.windowFocused ? -1 : 1;
    const focused = Date.parse(right.lastFocusedAt) - Date.parse(left.lastFocusedAt);
    if (focused !== 0) return focused;
    const created = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (created !== 0) return created;
    return left.hostId.localeCompare(right.hostId);
  });
  return sorted[0] as MindFlowMcpHostRecord;
}

function compareHostsForDisplay(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return String(left.displayName).localeCompare(String(right.displayName)) || String(left.hostId).localeCompare(String(right.hostId));
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

function postJson(host: MindFlowMcpHostRecord, payload: Record<string, unknown>, clientId: string): Promise<Record<string, unknown> | undefined> {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(host.endpoint), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${host.token}`,
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

function noHostMessage(unavailable: UnavailableMindFlowSession[]): string {
  const detail = unavailable.length ? ` Unavailable hosts: ${unavailable.map((item) => item.reason).join("; ")}` : "";
  return `No active local MindFlow VS Code host. Start VS Code and ensure the MindFlow extension is active.${detail}`;
}

function hostCandidates(hosts: MindFlowMcpHostRecord[]): string {
  return hosts.map((host) => `${host.hostId} (${host.displayName})`).sort().join(", ");
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
