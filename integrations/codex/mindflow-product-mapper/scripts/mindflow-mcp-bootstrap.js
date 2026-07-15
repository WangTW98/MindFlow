#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const crypto = require("node:crypto");

function sessionDirectory() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "MindFlow", "mcp", "sessions");
  }
  return path.join(os.homedir(), ".mindflow", "mcp", "sessions");
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function canonical(value) {
  try { return fs.realpathSync.native(value); } catch { return path.resolve(value); }
}

function contained(candidate, root) {
  const relative = path.relative(canonical(root), canonical(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function loadSessions() {
  const directory = sessionDirectory();
  let names = [];
  try { names = fs.readdirSync(directory).filter((name) => name.endsWith(".json")); } catch { return []; }
  return names.flatMap((name) => {
    const file = path.join(directory, name);
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!alive(value.pid) || !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(value.endpoint) || typeof value.token !== "string" || !value.token) {
        try { fs.rmSync(file, { force: true }); } catch {}
        return [];
      }
      value.__file = file;
      return [value];
    } catch {
      try { fs.rmSync(file, { force: true }); } catch {}
      return [];
    }
  });
}

function chooseSession(sessions) {
  const cwd = process.cwd();
  const ranked = sessions.map((session) => {
    const roots = Array.isArray(session.workspaceRoots) ? session.workspaceRoots.filter((root) => typeof root === "string") : [];
    const matching = roots.filter((root) => contained(cwd, root));
    return { session, match: matching.length ? Math.max(...matching.map((root) => canonical(root).length)) : -1 };
  });
  const scoped = ranked.filter((item) => item.match >= 0);
  const candidates = scoped.length ? scoped : ranked.filter((item) => !Array.isArray(item.session.workspaceRoots) || item.session.workspaceRoots.length === 0);
  candidates.sort((a, b) => b.match - a.match || Date.parse(b.session.lastSeenAt || b.session.createdAt || 0) - Date.parse(a.session.lastSeenAt || a.session.createdAt || 0));
  return candidates[0] && candidates[0].session;
}

const session = chooseSession(loadSessions());
if (!session) {
  process.stderr.write(`No active MindFlow VS Code session matches ${process.cwd()}. Open the workspace and a .mindflow editor, then retry.\n`);
  process.exit(1);
}

const clientId = `plugin-${process.pid}-${crypto.randomUUID()}`;
let chain = Promise.resolve();
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    const response = await fetch(session.endpoint, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${session.token}`,
        "content-type": "application/json",
        "x-mindflow-mcp-client": clientId
      },
      body: line
    });
    const body = await response.text();
    if (!response.ok && !body) throw new Error(`MindFlow MCP returned HTTP ${response.status}`);
    if (body.trim()) process.stdout.write(`${body.trim()}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  });
});
