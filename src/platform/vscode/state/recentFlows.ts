import type * as vscode from "vscode";
import { canonicalFileKey, canonicalLocalFilePath } from "../../../shared/canonicalFileKey";

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
    const normalizedPath = canonicalLocalFilePath(flowPath);
    const key = canonicalFileKey(normalizedPath);
    const records = this.get() ?? [];
    await this.replace([
      { absolutePath: normalizedPath, lastOpenedAt: openedAt },
      ...records.filter((record) => canonicalFileKey(record.absolutePath) !== key)
    ]);
  }

  public async remove(flowPath: string): Promise<void> {
    const key = canonicalFileKey(flowPath);
    const records = this.get() ?? [];
    await this.replace(records.filter((record) => canonicalFileKey(record.absolutePath) !== key));
  }

  public async clear(): Promise<void> {
    await this.state.update(RECENT_FLOWS_KEY, []);
  }
}

function normalizeRecentFlows(records: RecentFlowRecord[]): RecentFlowRecord[] {
  const seen = new Set<string>();
  return records
    .map((record) => ({
      absolutePath: canonicalLocalFilePath(record.absolutePath),
      lastOpenedAt: Number.isFinite(record.lastOpenedAt) ? record.lastOpenedAt : 0
    }))
    .filter((record) => {
      const key = canonicalFileKey(record.absolutePath);
      if (!record.absolutePath || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, RECENT_FLOW_LIMIT);
}
