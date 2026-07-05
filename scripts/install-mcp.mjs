#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverName = "mindflow";
const launcherPath = path.join(root, "scripts", "mindflow-mcp.mjs");
const compiledServerPath = path.join(root, "out", "src", "mcp", "server.js");
const defaultClients = ["codex", "gemini", "claude"];

let options;

try {
  options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main() {
  await ensureCompiled();

  const installers = {
    codex: options.scope === "project" ? installCodexProject : installCodexUser,
    gemini: options.scope === "project" ? installGeminiProject : installGeminiUser,
    claude: options.scope === "project" ? installClaudeProject : installClaudeUser
  };

  for (const client of options.clients) {
    const installer = installers[client];
    if (!installer) {
      console.warn(`Skipping unknown client: ${client}`);
      continue;
    }
    await installer();
  }
}

async function installCodexUser() {
  if (!(await commandExists("codex"))) {
    console.log("Codex CLI not found; skipping Codex user config.");
    return;
  }
  await run("codex", ["mcp", "remove", serverName], { ignoreFailure: true });
  await run("codex", [
    "mcp",
    "add",
    serverName,
    "--env",
    `MINDFLOW_WORKSPACE=${options.workspaceRoot}`,
    "--",
    options.nodePath,
    launcherPath
  ]);
  console.log("Registered MindFlow MCP with Codex user config.");
}

async function installGeminiUser() {
  if (!(await commandExists("gemini"))) {
    console.log("Gemini CLI not found; skipping Gemini user config.");
    return;
  }
  await run("gemini", ["mcp", "remove", serverName, "-s", "user"], { ignoreFailure: true });
  await run("gemini", [
    "mcp",
    "add",
    "-s",
    "user",
    "-e",
    `MINDFLOW_WORKSPACE=${options.workspaceRoot}`,
    serverName,
    options.nodePath,
    launcherPath
  ]);
  console.log("Registered MindFlow MCP with Gemini user config.");
}

async function installClaudeUser() {
  if (!(await commandExists("claude"))) {
    console.log("Claude Code CLI not found; skipping Claude user config.");
    return;
  }
  await run("claude", ["mcp", "remove", serverName, "--scope", "user"], { ignoreFailure: true });
  await run("claude", [
    "mcp",
    "add",
    "--env",
    `MINDFLOW_WORKSPACE=${options.workspaceRoot}`,
    "--scope",
    "user",
    "--transport",
    "stdio",
    serverName,
    "--",
    options.nodePath,
    launcherPath
  ]);
  console.log("Registered MindFlow MCP with Claude Code user config.");
}

async function installCodexProject() {
  const configPath = path.join(root, ".codex", "config.toml");
  const block = [
    "[mcp_servers.mindflow]",
    `command = ${tomlString(options.nodePath)}`,
    `args = ${tomlArray([launcherPath])}`,
    `env = { MINDFLOW_WORKSPACE = ${tomlString(options.workspaceRoot)} }`,
    "startup_timeout_sec = 20",
    "tool_timeout_sec = 120",
    "enabled = true",
    ""
  ].join("\n");
  await mkdir(path.dirname(configPath), { recursive: true });
  const existing = await readTextIfExists(configPath);
  await writeFile(configPath, replaceTomlSection(existing, "[mcp_servers.mindflow]", block), "utf8");
  console.log(`Wrote Codex project MCP config: ${relative(configPath)}`);
}

async function installGeminiProject() {
  const configPath = path.join(root, ".gemini", "settings.json");
  const settings = await readJsonIfExists(configPath);
  settings.mcpServers = isRecord(settings.mcpServers) ? settings.mcpServers : {};
  settings.mcpServers.mindflow = {
    command: options.nodePath,
    args: [launcherPath],
    env: {
      MINDFLOW_WORKSPACE: options.workspaceRoot
    },
    cwd: root,
    timeout: 600000,
    trust: false
  };
  if (isRecord(settings.mcp)) {
    if (Array.isArray(settings.mcp.allowed) && !settings.mcp.allowed.includes(serverName)) {
      settings.mcp.allowed.push(serverName);
    }
    if (Array.isArray(settings.mcp.excluded)) {
      settings.mcp.excluded = settings.mcp.excluded.filter((name) => name !== serverName);
    }
  }
  await writeJson(configPath, settings);
  console.log(`Wrote Gemini project MCP config: ${relative(configPath)}`);
}

async function installClaudeProject() {
  const configPath = path.join(root, ".mcp.json");
  const settings = await readJsonIfExists(configPath);
  settings.mcpServers = isRecord(settings.mcpServers) ? settings.mcpServers : {};
  settings.mcpServers.mindflow = {
    command: options.nodePath,
    args: [launcherPath],
    env: {
      MINDFLOW_WORKSPACE: options.workspaceRoot
    }
  };
  await writeJson(configPath, settings);
  console.log(`Wrote Claude Code project MCP config: ${relative(configPath)}`);
}

async function ensureCompiled() {
  try {
    await access(compiledServerPath, fsConstants.R_OK);
    await access(launcherPath, fsConstants.R_OK);
  } catch {
    throw new Error(`MindFlow MCP server is not ready. Run npm run compile before installing.`);
  }
}

function parseArgs(args) {
  const parsed = {
    clients: defaultClients,
    scope: "user",
    workspaceRoot: root,
    nodePath: process.execPath,
    help: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--client" || arg === "--clients") {
      parsed.clients = splitList(requireValue(args, ++index, arg));
      continue;
    }
    if (arg === "--scope") {
      parsed.scope = requireValue(args, ++index, arg);
      continue;
    }
    if (arg === "--workspace") {
      parsed.workspaceRoot = path.resolve(requireValue(args, ++index, arg));
      continue;
    }
    if (arg === "--node") {
      parsed.nodePath = requireValue(args, ++index, arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!["user", "project"].includes(parsed.scope)) {
    throw new Error("--scope must be user or project.");
  }
  parsed.clients = parsed.clients.map((client) => client.toLowerCase());
  return parsed;
}

function splitList(value) {
  if (value === "all") {
    return defaultClients;
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

async function commandExists(command) {
  const pathValue = process.env.PATH || "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) {
      continue;
    }
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        await access(candidate, fsConstants.X_OK);
        return true;
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return false;
}

function run(command, args, { ignoreFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      if (ignoreFailure) {
        resolve("");
      } else {
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (code === 0 || ignoreFailure) {
        if (output.trim() && !ignoreFailure) {
          process.stdout.write(output);
        }
        resolve(output);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit ${code}.\n${output}`));
    });
  });
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readJsonIfExists(filePath) {
  const text = await readTextIfExists(filePath);
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function replaceTomlSection(existing, header, block) {
  const lines = existing.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    return `${existing.trimEnd()}${existing.trim() ? "\n\n" : ""}${block}`;
  }
  let end = start + 1;
  while (end < lines.length && !lines[end].trim().startsWith("[")) {
    end += 1;
  }
  lines.splice(start, end - start, ...block.trimEnd().split("\n"));
  return `${lines.join("\n").trimEnd()}\n`;
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlString(value) {
  return JSON.stringify(value);
}

function relative(filePath) {
  return path.relative(root, filePath);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printHelp() {
  console.log(`Usage: node scripts/install-mcp.mjs [options]

Registers the MindFlow MCP server with local agent clients.

Options:
  --client, --clients <list>   Comma-separated clients: codex,gemini,claude,all
  --scope <user|project>       user uses installed CLIs; project writes repo config files
  --workspace <path>           Workspace root exposed to MindFlow tools
  --node <path>                Node executable used by MCP clients
  -h, --help                   Show this help

Examples:
  npm run mcp:install
  node scripts/install-mcp.mjs --client codex
  node scripts/install-mcp.mjs --scope project --clients all`);
}
