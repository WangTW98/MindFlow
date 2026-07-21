import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface FileIdentityUriLike {
  scheme?: string;
  fsPath?: string;
  toString(): string;
}

/**
 * Returns a stable identity for a local file. Existing files are resolved to
 * their physical path so symlink and case aliases on case-insensitive volumes
 * share one key. Non-file URIs retain URI identity.
 */
export function canonicalFileKey(value: string | FileIdentityUriLike): string {
  const localPath = readLocalFilePath(value);
  if (localPath !== undefined) {
    return `file:${comparisonPath(canonicalLocalFilePath(localPath))}`;
  }
  const raw = typeof value === "string" ? value : value.toString();
  try {
    return `uri:${new URL(raw).toString()}`;
  } catch {
    return `uri:${raw.trim()}`;
  }
}

/** Resolve an existing path to its physical on-disk spelling, with a lexical fallback. */
export function canonicalLocalFilePath(value: string): string {
  const resolved = path.resolve(value);
  try {
    return path.normalize(fs.realpathSync.native(resolved));
  } catch {
    // New or missing files do not yet have a physical identity.
    return path.normalize(resolved);
  }
}

function readLocalFilePath(value: string | FileIdentityUriLike): string | undefined {
  if (typeof value !== "string") {
    if (value.scheme === "file" && typeof value.fsPath === "string" && value.fsPath) {
      return value.fsPath;
    }
    return readLocalFilePath(value.toString());
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "file:" ? fileURLToPath(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function comparisonPath(value: string): string {
  return process.platform === "win32" || process.platform === "darwin"
    ? value.toLocaleLowerCase("en-US")
    : value;
}
