import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { MINDFLOW_HOST_SESSION_FIELDS } from "../protocol/globalToolSchemas";

export const MINDFLOW_SESSION_HEARTBEAT_INTERVAL_MS = 15_000;
export const MINDFLOW_SESSION_STALE_AFTER_MS = 60_000;
const MINDFLOW_SESSION_MAX_FUTURE_SKEW_MS = 5 * 60_000;

export interface MindFlowMcpHostRecord {
  hostId: string;
  displayName: string;
  environment: "local";
  endpoint: string;
  token: string;
  pid: number;
  createdAt: string;
  lastSeenAt: string;
  extensionVersion: string;
  contractVersion: number;
  contractHash: string;
  windowFocused: boolean;
  lastFocusedAt: string;
}

export interface UnavailableMindFlowSession {
  fileName: string;
  reason: string;
  hostId?: string;
}

export interface MindFlowSessionDiscovery {
  sessions: MindFlowMcpHostRecord[];
  unavailable: UnavailableMindFlowSession[];
}

export function mindflowMcpDirectory(): string {
  if (process.env.MINDFLOW_MCP_HOME) {
    return path.resolve(process.env.MINDFLOW_MCP_HOME);
  }
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
  expectedContractHash?: string,
  nowMs = Date.now()
): Promise<MindFlowSessionDiscovery> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const sessions: MindFlowMcpHostRecord[] = [];
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
      const lastSeenMs = Date.parse(record.lastSeenAt);
      if (lastSeenMs > nowMs + MINDFLOW_SESSION_MAX_FUTURE_SKEW_MS) {
        throw new Error("Extension Host heartbeat is implausibly far in the future.");
      }
      if (nowMs - lastSeenMs > MINDFLOW_SESSION_STALE_AFTER_MS) {
        throw new Error("Extension Host heartbeat is stale.");
      }
      if (expectedContractHash && record.contractHash !== expectedContractHash) {
        unavailable.push({
          fileName: entry.name,
          reason: "MindFlow MCP contract does not match the installed global Router. Reload VS Code and restart the Agent.",
          hostId: record.hostId
        });
        continue;
      }
      sessions.push(record);
    } catch (error) {
      unavailable.push({ fileName: entry.name, reason: errorMessage(error) });
    }
  }

  return { sessions, unavailable };
}

export function parseMindFlowSessionRecord(value: unknown, fileName?: string): MindFlowMcpHostRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid MindFlow MCP session record.");
  }
  const allowedFields = new Set<string>(MINDFLOW_HOST_SESSION_FIELDS);
  const unexpectedFields = Object.keys(value).filter((field) => !allowedFields.has(field));
  if (unexpectedFields.length > 0) {
    throw new Error(`Invalid legacy or unsupported session field(s): ${unexpectedFields.join(", ")}.`);
  }
  const hostId = requireString(value.hostId, "hostId");
  if (fileName && fileName !== `${hostId}.json`) {
    throw new Error("Host ID does not match its registry filename.");
  }
  const endpoint = validateEndpoint(requireString(value.endpoint, "endpoint"));
  const pid = value.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    throw new Error("Invalid session pid.");
  }
  const contractHash = requireString(value.contractHash, "contractHash");
  if (!/^[a-f0-9]{64}$/i.test(contractHash)) throw new Error("Invalid session contractHash.");
  if (value.environment !== "local") throw new Error("Unsupported non-local MindFlow host environment.");
  if (typeof value.contractVersion !== "number" || !Number.isInteger(value.contractVersion) || value.contractVersion < 1) {
    throw new Error("Invalid session contractVersion.");
  }
  if (typeof value.windowFocused !== "boolean") {
    throw new Error("Invalid session windowFocused.");
  }
  return {
    hostId,
    displayName: requireString(value.displayName, "displayName"),
    environment: "local",
    endpoint,
    token: requireString(value.token, "token"),
    pid,
    createdAt: requireTimestamp(value.createdAt, "createdAt"),
    lastSeenAt: requireTimestamp(value.lastSeenAt, "lastSeenAt"),
    extensionVersion: requireString(value.extensionVersion, "extensionVersion"),
    contractVersion: value.contractVersion,
    contractHash,
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
