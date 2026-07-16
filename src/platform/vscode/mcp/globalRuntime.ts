import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { mindflowMcpContractHash } from "../../mcp/protocol/contractHash";
import { MINDFLOW_MCP_CONTRACT_VERSION } from "../../mcp/protocol/globalToolSchemas";
import { discoverMindFlowSessions, mindflowRuntimeDirectory } from "../../mcp/runtime/sessionRegistry";

const ROUTER_BUNDLE_RELATIVE_PATH = "out/mcp-runtime/mindflow-mcp-router.cjs";
const ROUTER_FILE_NAME = "mindflow-mcp-router.cjs";
const RUNTIME_MANIFEST_FILE_NAME = "runtime.json";
const SELF_TEST_TIMEOUT_MS = 10_000;

export interface MindFlowGlobalRuntimeInstallation {
  routerPath: string;
  manifestPath: string;
  bundleHash: string;
  contractHash: string;
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
    const contractHash = mindflowMcpContractHash();
    const extensionVersion = String(this.context.extension.packageJSON?.version ?? "unknown");
    const existingHash = await fs.readFile(routerPath).then((value) => createHash("sha256").update(value).digest("hex")).catch(() => undefined);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await fs.chmod(directory, 0o700);
    if (existingHash !== bundleHash) {
      await writeAtomic(routerPath, bundle, 0o600);
    }
    if (process.platform !== "win32") await fs.chmod(routerPath, 0o600);
    const desiredManifest = {
      bundleHash,
      contractHash,
      contractVersion: MINDFLOW_MCP_CONTRACT_VERSION,
      extensionVersion
    };
    const currentManifest = await readRuntimeManifest(manifestPath);
    if (!currentManifest || !sameRuntimeManifest(currentManifest, desiredManifest)) {
      await writeAtomic(manifestPath, Buffer.from(`${JSON.stringify({ ...desiredManifest, installedAt: new Date().toISOString() }, null, 2)}\n`), 0o600);
    }
    if (process.platform !== "win32") await fs.chmod(manifestPath, 0o600);
    return { routerPath, manifestPath, bundleHash, contractHash };
  }

  public async buildGlobalConfig(): Promise<Record<string, unknown>> {
    const installation = await this.ensureInstalled();
    const runtime = await this.resolveRuntime(installation.routerPath, installation.contractHash);
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
    const discovery = await discoverMindFlowSessions(undefined, installation.contractHash);
    const runtime = await this.resolveRuntime(installation.routerPath, installation.contractHash).catch((error) => ({ error: errorMessage(error) }));
    return {
      routerPath: installation.routerPath,
      bundleHash: installation.bundleHash,
      contractHash: installation.contractHash,
      contractVersion: MINDFLOW_MCP_CONTRACT_VERSION,
      runtime,
      hosts: discovery.sessions.map((session) => ({
        hostId: session.hostId,
        displayName: session.displayName,
        focused: session.windowFocused,
        extensionVersion: session.extensionVersion
      })),
      unavailable: discovery.unavailable
    };
  }

  private async resolveRuntime(routerPath: string, expectedContractHash: string): Promise<MindFlowRuntimeCommand> {
    const electronRuntime: MindFlowRuntimeCommand = {
      command: process.execPath,
      args: [routerPath],
      env: { ELECTRON_RUN_AS_NODE: "1" }
    };
    if (await selfTestRuntime(electronRuntime, expectedContractHash)) {
      return electronRuntime;
    }
    const nodePath = await findExecutableOnPath(process.platform === "win32" ? ["node.exe"] : ["node"]);
    if (nodePath) {
      const nodeRuntime: MindFlowRuntimeCommand = { command: nodePath, args: [routerPath] };
      if (await selfTestRuntime(nodeRuntime, expectedContractHash)) {
        return nodeRuntime;
      }
    }
    throw new Error("No compatible Node.js runtime can start the MindFlow global Router. Install Node.js 18 or newer and retry.");
  }
}

async function selfTestRuntime(runtime: MindFlowRuntimeCommand, expectedContractHash: string): Promise<boolean> {
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
        const result = JSON.parse(stdout.trim()) as { ok?: unknown; contractVersion?: unknown; contractHash?: unknown };
        resolve(result.ok === true && result.contractVersion === MINDFLOW_MCP_CONTRACT_VERSION && result.contractHash === expectedContractHash);
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

interface RuntimeManifestIdentity {
  bundleHash: string;
  contractHash: string;
  contractVersion: number;
  extensionVersion: string;
}

async function readRuntimeManifest(manifestPath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function sameRuntimeManifest(current: Record<string, unknown>, desired: RuntimeManifestIdentity): boolean {
  return current.bundleHash === desired.bundleHash && current.contractHash === desired.contractHash &&
    current.contractVersion === desired.contractVersion && current.extensionVersion === desired.extensionVersion;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
