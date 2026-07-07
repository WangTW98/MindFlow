export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" && obj[key].trim() ? obj[key] : undefined;
}

export function readOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" ? obj[key] : undefined;
}

export function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  return typeof obj[key] === "number" && Number.isFinite(obj[key]) ? obj[key] : undefined;
}

export function readOptionalNumber(obj: Record<string, unknown>, key: string): number | false | undefined {
  if (obj[key] === undefined) {
    return undefined;
  }
  return typeof obj[key] === "number" && Number.isFinite(obj[key]) ? obj[key] : false;
}

export function readOptionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

export function readRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = obj[key];
  return isRecord(value) ? value : undefined;
}
