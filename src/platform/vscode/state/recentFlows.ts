import * as path from "node:path";
import type * as vscode from "vscode";

const RECENT_FLOWS_KEY = "mindflow.recentFlows";
const RECENT_FLOW_LIMIT = 20;

export interface RecentFlowRecord {
  absolutePath: string;
  lastOpenedAt: number;
}

export class RecentFlowStore {
  public constructor(private readonly state: vscode.Memento) {}

  public get(): RecentFlowRecord[] | undefined {
    const records = this.state.get<RecentFlowRecord[]>(RECENT_FLOWS_KEY);
    return records ? normalizeRecentFlows(records) : undefined;
  }

  public async replace(records: RecentFlowRecord[]): Promise<void> {
    await this.state.update(RECENT_FLOWS_KEY, normalizeRecentFlows(records));
  }

  public async add(flowPath: string, openedAt = Date.now()): Promise<void> {
    const normalizedPath = normalizePath(flowPath);
    const records = this.get() ?? [];
    await this.replace([
      { absolutePath: normalizedPath, lastOpenedAt: openedAt },
      ...records.filter((record) => normalizePath(record.absolutePath) !== normalizedPath)
    ]);
  }

  public async remove(flowPath: string): Promise<void> {
    const normalizedPath = normalizePath(flowPath);
    const records = this.get() ?? [];
    await this.replace(records.filter((record) => normalizePath(record.absolutePath) !== normalizedPath));
  }

  public async clear(): Promise<void> {
    await this.state.update(RECENT_FLOWS_KEY, []);
  }
}

function normalizeRecentFlows(records: RecentFlowRecord[]): RecentFlowRecord[] {
  const seen = new Set<string>();
  return records
    .map((record) => ({
      absolutePath: normalizePath(record.absolutePath),
      lastOpenedAt: Number.isFinite(record.lastOpenedAt) ? record.lastOpenedAt : 0
    }))
    .filter((record) => {
      if (!record.absolutePath || seen.has(record.absolutePath)) {
        return false;
      }
      seen.add(record.absolutePath);
      return true;
    })
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, RECENT_FLOW_LIMIT);
}

function normalizePath(flowPath: string): string {
  return path.normalize(flowPath);
}
