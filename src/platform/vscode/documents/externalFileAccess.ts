import * as fs from "node:fs/promises";
import * as path from "node:path";

export type MindFlowExternalFileAccessMode = "prompt" | "allow" | "workspaceOnly";

const pendingConfirmations = new Map<string, Promise<boolean>>();

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
  let confirmation = pendingConfirmations.get(realPath);
  if (!confirmation) {
    confirmation = confirmExternal(realPath).finally(() => {
      pendingConfirmations.delete(realPath);
    });
    pendingConfirmations.set(realPath, confirmation);
  }
  if (!await confirmation) {
    throw new Error(`User declined MindFlow MCP access to external file: ${realPath}`);
  }
  return realPath;
}

function isPathContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
