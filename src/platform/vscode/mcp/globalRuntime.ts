import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { mindflowToolsetHash } from "../../mcp/protocol/toolsetHash";
import { discoverMindFlowSessions, mindflowRuntimeDirectory } from "../../mcp/runtime/sessionRegistry";

const ROUTER_BUNDLE_RELATIVE_PATH = "out/mcp-runtime/mindflow-mcp-router.cjs";
const ROUTER_FILE_NAME = "mindflow-mcp-router.cjs";
const RUNTIME_MANIFEST_FILE_NAME = "runtime.json";
const SELF_TEST_TIMEOUT_MS = 10_000;

export interface MindFlowGlobalRuntimeInstallation {
  routerPath: string;
  manifestPath: string;
  bundleHash: string;
  toolsetHash: string;
}

export interface MindFlowRuntimeCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MindFlowGlobalRuntimeManager {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async ensureInstalled(): Promise<MindFlowGlobalRuntimeInstallation> {
    const sourcePath = path.join(this.context.extensionUri.fsPath, ROUTER_BUNDLE_RELATIVE_PATH);
    const bundle = await fs.readFile(sourcePath).catch(() => {
      throw new Error(`MindFlow global Router bundle is missing: ${sourcePath}. Reinstall the extension.`);
    });
    const directory = mindflowRuntimeDirectory();
    const routerPath = path.join(directory, ROUTER_FILE_NAME);
    const manifestPath = path.join(directory, RUNTIME_MANIFEST_FILE_NAME);
    const bundleHash = createHash("sha256").update(bundle).digest("hex");
    const toolsetHash = mindflowToolsetHash();
    const existingHash = await fs.readFile(routerPath).then((value) => createHash("sha256").update(value).digest("hex")).catch(() => undefined);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await fs.chmod(directory, 0o700);
    if (existingHash !== bundleHash) {
      await writeAtomic(routerPath, bundle, 0o600);
    }
    if (process.platform !== "win32") await fs.chmod(routerPath, 0o600);
    const manifest = {
      bundleHash,
      toolsetHash,
      extensionVersion: String(this.context.extension.packageJSON?.version ?? "unknown"),
      installedAt: new Date().toISOString()
    };
    await writeAtomic(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), 0o600);
    return { routerPath, manifestPath, bundleHash, toolsetHash };
  }

  public async buildGlobalConfig(): Promise<Record<string, unknown>> {
    const installation = await this.ensureInstalled();
    const runtime = await this.resolveRuntime(installation.routerPath, installation.toolsetHash);
    return {
      mcpServers: {
        mindflow: {
          command: runtime.command,
          args: runtime.args,
          ...(runtime.env ? { env: runtime.env } : {})
        }
      }
    };
  }

  public async status(): Promise<Record<string, unknown>> {
    const installation = await this.ensureInstalled();
    const discovery = await discoverMindFlowSessions(undefined, installation.toolsetHash);
    const runtime = await this.resolveRuntime(installation.routerPath, installation.toolsetHash).catch((error) => ({ error: errorMessage(error) }));
    return {
      routerPath: installation.routerPath,
      bundleHash: installation.bundleHash,
      toolsetHash: installation.toolsetHash,
      runtime,
      workspaces: discovery.sessions.flatMap((session) => session.workspaceFolders.map((folder) => ({
        workspaceUri: folder.uri,
        name: folder.name,
        focused: session.windowFocused,
        extensionVersion: session.extensionVersion
      }))),
      unavailable: discovery.unavailable
    };
  }

  private async resolveRuntime(routerPath: string, expectedToolsetHash: string): Promise<MindFlowRuntimeCommand> {
    const electronRuntime: MindFlowRuntimeCommand = {
      command: process.execPath,
      args: [routerPath],
      env: { ELECTRON_RUN_AS_NODE: "1" }
    };
    if (await selfTestRuntime(electronRuntime, expectedToolsetHash)) {
      return electronRuntime;
    }
    const nodePath = await findExecutableOnPath(process.platform === "win32" ? ["node.exe"] : ["node"]);
    if (nodePath) {
      const nodeRuntime: MindFlowRuntimeCommand = { command: nodePath, args: [routerPath] };
      if (await selfTestRuntime(nodeRuntime, expectedToolsetHash)) {
        return nodeRuntime;
      }
    }
    throw new Error("No compatible Node.js runtime can start the MindFlow global Router. Install Node.js 18 or newer and retry.");
  }
}

async function selfTestRuntime(runtime: MindFlowRuntimeCommand, expectedToolsetHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(runtime.command, [...runtime.args, "--self-test"], {
      env: { ...process.env, ...runtime.env },
      stdio: ["ignore", "pipe", "ignore"]
    });
    let stdout = "";
    const timer = setTimeout(() => child.kill(), SELF_TEST_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(false);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim()) as { ok?: unknown; toolsetHash?: unknown };
        resolve(result.ok === true && result.toolsetHash === expectedToolsetHash);
      } catch {
        resolve(false);
      }
    });
  });
}

async function findExecutableOnPath(names: string[]): Promise<string | undefined> {
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    for (const name of names) {
      const candidate = path.resolve(directory, name);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }
  }
  return undefined;
}

async function writeAtomic(targetPath: string, contents: Buffer, mode: number): Promise<void> {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, contents, { mode });
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
