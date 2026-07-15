import * as path from "node:path";

export function normalizeWorkspaceRelativeDirectory(value: string): string {
  const configured = value.trim();
  if (!configured || path.isAbsolute(configured)) {
    throw new Error("mindflow.storage.flowDirectory must be a non-empty workspace-relative path.");
  }
  const normalized = path.normalize(configured);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error("mindflow.storage.flowDirectory cannot escape the workspace folder.");
  }
  return normalized;
}

export function isPathInsideWorkspace(root: string, candidate: string): boolean {
  const relative = path.relative(path.normalize(root), path.normalize(candidate));
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
