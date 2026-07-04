import type { HttpAgentConfig } from "./AgentProvider";
import { HttpJsonAgentProvider } from "./HttpJsonAgentProvider";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

export class CodexProvider extends HttpJsonAgentProvider {
  public readonly id = "codex" as const;

  public constructor(config: HttpAgentConfig) {
    super(config);
  }

  protected override async invokeJson(prompt: string): Promise<unknown> {
    if (this.config.endpoint) {
      return super.invokeJson(prompt);
    }

    const outputText = await this.invokeCodexCli(prompt);
    try {
      return JSON.parse(extractStrictJson(outputText)) as unknown;
    } catch (error) {
      const debugPath = await this.writeCodexDebug(prompt, outputText);
      const suffix = debugPath ? ` Raw Codex output saved to ${debugPath}.` : "";
      throw new Error(`Codex CLI returned invalid JSON.${suffix} ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async invokeCodexCli(prompt: string): Promise<string> {
    const debugDirectory = this.config.debugDirectory ?? path.join(this.config.workspaceRoot ?? ".", ".mindflow", "debug");
    await fs.mkdir(debugDirectory, { recursive: true });
    const outputFile = path.join(debugDirectory, `codex-last-message-${Date.now()}.txt`);
    const candidates = unique([
      this.config.codexCliPath || "codex",
      "/usr/local/bin/codex",
      "/opt/homebrew/bin/codex"
    ]);
    const args = [
      "--sandbox",
      "read-only",
      "--ask-for-approval",
      "never",
      "exec",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--output-last-message",
      outputFile
    ];
    if (this.config.workspaceRoot) {
      args.push("-C", this.config.workspaceRoot);
    }
    if (this.config.model) {
      args.push("-m", this.config.model);
    }
    args.push("-");

    let lastError: unknown;
    for (const command of candidates) {
      try {
        await runWithStdin(command, args, prompt, this.config.workspaceRoot);
        return await fs.readFile(outputFile, "utf8");
      } catch (error) {
        lastError = error;
        const code = isErrorWithCode(error) ? error.code : undefined;
        if (code && code !== "ENOENT") {
          break;
        }
      }
    }
    throw new Error(`Unable to run Codex CLI. ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  private async writeCodexDebug(prompt: string, outputText: string): Promise<string | undefined> {
    if (!this.config.debugDirectory) {
      return undefined;
    }
    await fs.mkdir(this.config.debugDirectory, { recursive: true });
    const filePath = path.join(this.config.debugDirectory, `codex-invalid-json-${Date.now()}.json`);
    await fs.writeFile(filePath, `${JSON.stringify({ provider: this.id, prompt, outputText }, null, 2)}\n`, "utf8");
    return filePath;
  }
}

function runWithStdin(command: string, args: string[], stdin: string, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout?.on("data", () => {
      // Codex writes progress to stdout; the final response is read from --output-last-message.
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`codex exec exited with ${code ?? "unknown"}${stderr ? `: ${stderr}` : ""}`));
    });
    child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

function extractStrictJson(outputText: string): string {
  const trimmed = outputText.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }
  return trimmed;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isErrorWithCode(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && "code" in error;
}
