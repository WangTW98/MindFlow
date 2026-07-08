import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { FlowRepository } from "../../../product-flow/infrastructure/persistence/flowRepository";
import { RecentFlowStore, type RecentFlowRecord } from "../state/recentFlows";

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
  getWorkspaceRoot(): string;
  recentFlows: RecentFlowStore;
  workspaceRecentFlows: RecentFlowStore;
}

export async function createSidebarState(options: SidebarStateOptions): Promise<SidebarState> {
  let workspaceRoot = "";
  try {
    workspaceRoot = options.getWorkspaceRoot();
  } catch {
    workspaceRoot = "";
  }
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  const repository = workspaceRoot ? new FlowRepository(workspaceRoot, flowDirectory) : undefined;
  let recentRecords = await getGlobalRecentRecords(options.recentFlows, options.workspaceRecentFlows);
  if (!recentRecords && repository) {
    const seededRecords = await seedRecentFlowRecords(await repository.list().catch(() => []));
    await options.recentFlows.replace(seededRecords);
    recentRecords = options.recentFlows.get();
  }
  const flows = await Promise.all((recentRecords ?? []).map((record) => toFlowItem(workspaceRoot, record)));
  flows.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  return {
    flows
  };
}

async function getGlobalRecentRecords(
  recentFlows: RecentFlowStore,
  workspaceRecentFlows: RecentFlowStore
): Promise<RecentFlowRecord[] | undefined> {
  const globalRecords = recentFlows.get();
  const workspaceRecords = workspaceRecentFlows.get();
  if (workspaceRecords?.length) {
    await recentFlows.replace([...(globalRecords ?? []), ...workspaceRecords]);
    return recentFlows.get();
  }
  return globalRecords;
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
    relativePath: workspaceRoot ? path.relative(workspaceRoot, record.absolutePath) : record.absolutePath,
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
