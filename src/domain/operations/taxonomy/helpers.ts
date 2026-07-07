import { shortHash, slugify } from "../../../utils/id";
import type { TaxonomyRequest } from "./types";

export function upsertById<T>(items: T[], getId: (item: T) => string, next: T): void {
  const nextId = getId(next);
  const index = items.findIndex((item) => getId(item) === nextId);
  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }
}

export function requireRequestId(request: TaxonomyRequest): string {
  if (!request.id) {
    throw new Error("Taxonomy delete requires id.");
  }
  return request.id;
}

export function makeTaxonomyId(prefix: string, name: string): string {
  return `${prefix}_${slugify(name, prefix)}_${shortHash(`${name}:${Date.now()}`, 6)}`;
}

export function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

export function knownOnly(values: string[], knownIds: Set<string>): string[] {
  return values.filter((value) => knownIds.has(value));
}
