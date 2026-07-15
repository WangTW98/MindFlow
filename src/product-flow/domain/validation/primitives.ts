import { ENTITY_STATUSES } from "../model/constants";
import { isEntityStatus } from "../model/guards";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  errors: string[]
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${path ? `${path}.` : ""}${key} is not supported by the current MindFlow structure.`);
    }
  }
}

export function requireString(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "string") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a string.`);
  }
}

export function requireNonEmptyString(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  const value = obj[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a non-empty string.`);
  }
}

export function requireNumber(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a number.`);
  }
}

export function requirePositiveInteger(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a positive integer.`);
  }
}

export function requireIsoDateString(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  const value = obj[key];
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== "string" || !isoPattern.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a valid ISO date string.`);
  }
}

export function requireArray(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!Array.isArray(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an array.`);
  }
}

export function requireStringArray(obj: Record<string, unknown>, key: string, errors: string[], path?: string): string[] {
  const value = obj[key];
  const fullPath = `${path ? `${path}.` : ""}${key}`;
  if (!Array.isArray(value)) {
    errors.push(`${fullPath} must be an array.`);
    return [];
  }
  const strings: string[] = [];
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      errors.push(`${fullPath}[${index}] must be a string.`);
      continue;
    }
    if (!item.trim()) {
      errors.push(`${fullPath}[${index}] must be a non-empty string.`);
      continue;
    }
    if (seen.has(item)) {
      errors.push(`${fullPath}[${index}] duplicates ${item}.`);
      continue;
    }
    seen.add(item);
    strings.push(item);
  }
  return strings;
}

export function requireObject(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!isRecord(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an object.`);
  }
}

export function requireOptionalString(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (obj[key] !== undefined && typeof obj[key] !== "string") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a string.`);
  }
}

export function requireOptionalBoolean(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (obj[key] !== undefined && typeof obj[key] !== "boolean") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a boolean.`);
  }
}

export function validateEntityStatus(value: unknown, path: string, errors: string[]): void {
  if (typeof value === "string" && !isEntityStatus(value)) {
    errors.push(`${path} must be ${ENTITY_STATUSES.join(", ")}.`);
  }
}

export function validateReferences(
  ids: string[],
  validIds: Set<string>,
  path: string,
  label: string,
  issues: string[]
): void {
  for (const id of ids) {
    if (!validIds.has(id)) {
      issues.push(`${path} references missing ${label} ${id}.`);
    }
  }
}
