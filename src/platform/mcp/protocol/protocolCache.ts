interface ProtocolCacheEntry<T> {
  value: T;
  lastUsedAt: number;
}

export class MindFlowMcpProtocolCache<T> {
  private readonly entries = new Map<string, ProtocolCacheEntry<T>>();

  public constructor(
    private readonly maximumEntries = 32,
    private readonly idleTtlMs = 30 * 60_000,
    private readonly now: () => number = Date.now
  ) {}

  public get(clientId: string, factory: () => T): T {
    const now = this.now();
    this.evictExpired(now);
    const existing = this.entries.get(clientId);
    if (existing) {
      existing.lastUsedAt = now;
      return existing.value;
    }
    while (this.entries.size >= this.maximumEntries) this.evictOldest();
    const value = factory();
    this.entries.set(clientId, { value, lastUsedAt: now });
    return value;
  }

  public clear(): void {
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }

  private evictExpired(now: number): void {
    for (const [clientId, entry] of this.entries) {
      if (now - entry.lastUsedAt > this.idleTtlMs) this.entries.delete(clientId);
    }
  }

  private evictOldest(): void {
    let oldest: { clientId: string; lastUsedAt: number } | undefined;
    for (const [clientId, entry] of this.entries) {
      if (!oldest || entry.lastUsedAt < oldest.lastUsedAt) oldest = { clientId, lastUsedAt: entry.lastUsedAt };
    }
    if (oldest) this.entries.delete(oldest.clientId);
  }
}
