import * as fs from "node:fs/promises";
import * as path from "node:path";

export type MindFlowExternalFileAccessMode = "prompt" | "allow" | "workspaceOnly";

export async function authorizeMcpFileOpen(
  flowPath: string,
  workspaceRoots: readonly string[],
  mode: MindFlowExternalFileAccessMode,
  confirmExternal: (realPath: string) => Promise<boolean>
): Promise<string> {
  const realPath = await fs.realpath(flowPath);
  const realRoots = await Promise.all(workspaceRoots.map((root) => fs.realpath(root).catch(() => path.resolve(root))));
  if (realRoots.some((root) => isPathContained(root, realPath))) return realPath;
  if (mode === "allow") return realPath;
  if (mode === "workspaceOnly") {
    throw new Error(`MindFlow MCP external file access is restricted to open workspaces: ${realPath}`);
  }
  if (!await confirmExternal(realPath)) {
    throw new Error(`User declined MindFlow MCP access to external file: ${realPath}`);
  }
  return realPath;
}

function isPathContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
