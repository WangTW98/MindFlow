import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface MindFlowWorkspaceFolderRecord {
  uri: string;
  fsPath: string;
  name: string;
}

export interface MindFlowMcpSessionRecord {
  sessionId: string;
  endpoint: string;
  token: string;
  pid: number;
  createdAt: string;
  lastSeenAt: string;
  extensionVersion: string;
  toolsetHash: string;
  workspaceFolders: MindFlowWorkspaceFolderRecord[];
  windowFocused: boolean;
  lastFocusedAt: string;
}

export interface UnavailableMindFlowSession {
  fileName: string;
  reason: string;
  workspaceUris?: string[];
}

export interface MindFlowSessionDiscovery {
  sessions: MindFlowMcpSessionRecord[];
  unavailable: UnavailableMindFlowSession[];
}

export function mindflowMcpDirectory(): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "MindFlow", "mcp");
  }
  return path.join(os.homedir(), ".mindflow", "mcp");
}

export function mindflowSessionDirectory(): string {
  return path.join(mindflowMcpDirectory(), "sessions");
}

export function mindflowRuntimeDirectory(): string {
  return path.join(mindflowMcpDirectory(), "runtime");
}

export async function discoverMindFlowSessions(
  directory = mindflowSessionDirectory(),
  expectedToolsetHash?: string
): Promise<MindFlowSessionDiscovery> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const sessions: MindFlowMcpSessionRecord[] = [];
  const unavailable: UnavailableMindFlowSession[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    try {
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("Session registry entry is not a regular file.");
      }
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new Error("Session registry entry permissions must allow only the current user.");
      }
      const record = parseMindFlowSessionRecord(JSON.parse(await fs.readFile(filePath, "utf8")), entry.name);
      if (!isProcessAlive(record.pid)) {
        throw new Error("Extension Host process is not running.");
      }
      if (expectedToolsetHash && record.toolsetHash !== expectedToolsetHash) {
        unavailable.push({
          fileName: entry.name,
          reason: "MindFlow MCP toolset does not match the installed global Router. Reload VS Code and restart the Agent.",
          workspaceUris: record.workspaceFolders.map((folder) => folder.uri)
        });
        continue;
      }
      if (record.workspaceFolders.length === 0) {
        unavailable.push({ fileName: entry.name, reason: "VS Code window has no local workspace folder." });
        continue;
      }
      sessions.push(record);
    } catch (error) {
      unavailable.push({ fileName: entry.name, reason: errorMessage(error) });
    }
  }

  return { sessions, unavailable };
}

export function parseMindFlowSessionRecord(value: unknown, fileName?: string): MindFlowMcpSessionRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid MindFlow MCP session record.");
  }
  const sessionId = requireString(value.sessionId, "sessionId");
  if (fileName && fileName !== `${sessionId}.json`) {
    throw new Error("Session ID does not match its registry filename.");
  }
  const endpoint = validateEndpoint(requireString(value.endpoint, "endpoint"));
  const pid = value.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    throw new Error("Invalid session pid.");
  }
  const toolsetHash = requireString(value.toolsetHash, "toolsetHash");
  if (!/^[a-f0-9]{64}$/i.test(toolsetHash)) {
    throw new Error("Invalid session toolsetHash.");
  }
  if (!Array.isArray(value.workspaceFolders)) {
    throw new Error("Invalid session workspaceFolders.");
  }
  const workspaceFolders = value.workspaceFolders.map((folder, index) => parseWorkspaceFolder(folder, index));
  if (typeof value.windowFocused !== "boolean") {
    throw new Error("Invalid session windowFocused.");
  }
  return {
    sessionId,
    endpoint,
    token: requireString(value.token, "token"),
    pid,
    createdAt: requireTimestamp(value.createdAt, "createdAt"),
    lastSeenAt: requireTimestamp(value.lastSeenAt, "lastSeenAt"),
    extensionVersion: requireString(value.extensionVersion, "extensionVersion"),
    toolsetHash,
    workspaceFolders,
    windowFocused: value.windowFocused,
    lastFocusedAt: requireTimestamp(value.lastFocusedAt, "lastFocusedAt")
  };
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function parseWorkspaceFolder(value: unknown, index: number): MindFlowWorkspaceFolderRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid workspaceFolders[${index}].`);
  }
  const uri = requireString(value.uri, `workspaceFolders[${index}].uri`);
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Invalid local workspace URI: ${uri}`);
  }
  if (parsed.protocol !== "file:") {
    throw new Error(`Unsupported non-local workspace URI: ${uri}`);
  }
  const fsPath = requireString(value.fsPath, `workspaceFolders[${index}].fsPath`);
  if (!path.isAbsolute(fsPath)) {
    throw new Error(`Workspace path must be absolute: ${fsPath}`);
  }
  return { uri: parsed.toString(), fsPath: path.resolve(fsPath), name: requireString(value.name, `workspaceFolders[${index}].name`) };
}

function validateEndpoint(raw: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new Error("Invalid session endpoint URL.");
  }
  if (
    endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || endpoint.pathname !== "/mcp" ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash
  ) {
    throw new Error("Unsafe MindFlow MCP session endpoint.");
  }
  return endpoint.toString();
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid session ${field}.`);
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  const timestamp = requireString(value, field);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Invalid session ${field}.`);
  }
  return timestamp;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
