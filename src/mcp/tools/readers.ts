export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export function requireString(record: Record<string, unknown>, key: string): string {
  const value = readOptionalString(record, key);
  if (!value) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return value;
}

export function requireStringEither(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readOptionalString(record, key);
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing required string field: ${keys.join(" or ")}`);
}

export function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readStringPatch(record: Record<string, unknown>, key: string): string | undefined {
  return key in record && typeof record[key] === "string" ? record[key].trim() : undefined;
}

export function readOptionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  return Array.isArray(record[key]) ? readStringArray(record[key]) : undefined;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  return typeof record[key] === "boolean" ? record[key] : undefined;
}

export function readRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function resolveId(value: string, map: Map<string, string>): string {
  return map.get(value) ?? value;
}
