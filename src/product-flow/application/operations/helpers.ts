export function nonEmptyArrayOr(value: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

export function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
