import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { FlowRepository } from "../../../product-flow/infrastructure/persistence/flowRepository";
import { RecentFlowStore, type RecentFlowRecord } from "../state/recentFlows";
import { isPathInsideWorkspace } from "../documents/workspacePathPolicy";

export interface SidebarState {
  flows: FlowItem[];
}

export interface FlowItem {
  absolutePath: string;
  relativePath: string;
  name: string;
  lastOpenedAt: number;
  usedLabel: string;
}

export interface SidebarStateOptions {
  getWorkspaceRoot(): string | undefined;
  recentFlows: RecentFlowStore;
}

export async function createSidebarState(options: SidebarStateOptions): Promise<SidebarState> {
  const workspaceRoot = options.getWorkspaceRoot() ?? "";
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  const repository = workspaceRoot ? new FlowRepository(workspaceRoot, flowDirectory) : undefined;
  let recentRecords = options.recentFlows.get();
  if (!recentRecords && repository) {
    const seededRecords = await seedRecentFlowRecords(await repository.list().catch(() => []));
    await options.recentFlows.replace(seededRecords);
    recentRecords = options.recentFlows.get();
  }
  const existingRecords = await filterExistingFlowRecords(recentRecords ?? []);
  if (existingRecords.length !== (recentRecords ?? []).length) {
    await options.recentFlows.replace(existingRecords);
  }
  const flows = await Promise.all(existingRecords.map((record) => toFlowItem(workspaceRoot, record)));
  flows.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return {
    flows
  };
}

async function filterExistingFlowRecords(records: RecentFlowRecord[]): Promise<RecentFlowRecord[]> {
  const checks = await Promise.all(records.map(async (record) => {
    const stats = await fs.stat(record.absolutePath).catch(() => undefined);
    return stats?.isFile() && path.extname(record.absolutePath).toLowerCase() === ".mindflow" ? record : undefined;
  }));
  return checks.filter((record): record is RecentFlowRecord => Boolean(record));
}

async function seedRecentFlowRecords(files: string[]): Promise<RecentFlowRecord[]> {
  const records = await Promise.all(
    files.map(async (file) => ({
      absolutePath: file,
      lastOpenedAt: (await fs.stat(file).catch(() => ({ mtimeMs: 0 }))).mtimeMs
    }))
  );
  return records.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

async function toFlowItem(workspaceRoot: string, record: RecentFlowRecord): Promise<FlowItem> {
  const stats = await fs.stat(record.absolutePath).catch(() => undefined);
  const lastOpenedAt = record.lastOpenedAt || stats?.mtimeMs || 0;
  return {
    absolutePath: record.absolutePath,
    relativePath: workspaceRoot && isPathInsideWorkspace(workspaceRoot, record.absolutePath)
      ? path.relative(workspaceRoot, record.absolutePath)
      : record.absolutePath,
    name: path.basename(record.absolutePath),
    lastOpenedAt,
    usedLabel: lastOpenedAt ? `最近打开 ${formatDateTime(lastOpenedAt)}` : "最近打开时间未知"
  };
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
