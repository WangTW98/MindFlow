import { CURRENT_SCHEMA_VERSION } from "./constants";
import { ensureProjectOverview } from "./projectOverview";
import type { ProductFlow, ValidationResult } from "./types";
import { validateProductFlow } from "./validation";

export const CURRENT_PRODUCT_FLOW_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export interface ProductFlowParseResult {
  flow: ProductFlow;
  migrated: boolean;
  validation: ValidationResult;
}

const LEGACY_FLOW_KEYS = [
  "sourceDocumentId",
  "sourceSummary",
  "artifacts",
  "changeHistory",
  "syncState",
  "productDesignIssues",
  "openQuestions"
];

const LEGACY_NODE_KEYS = [
  "sourceRefs",
  "artifacts",
  "createdByChangeSetId",
  "updatedByChangeSetId",
  "removedByChangeSetId",
  "confidence"
];

const LEGACY_EDGE_KEYS = [
  "sourceRefs",
  "createdByChangeSetId",
  "updatedByChangeSetId",
  "removedByChangeSetId",
  "confidence"
];

export function parseProductFlowText(text: string, label = "ProductFlow"): ProductFlowParseResult {
  const parsed = JSON.parse(text) as unknown;
  const result = normalizeProductFlow(parsed);
  const validation = validateProductFlow(result.flow);
  if (!validation.valid) {
    throw new Error(`Invalid ${label}:\n${validation.errors.join("\n")}`);
  }
  return { ...result, validation };
}

export function tryParseProductFlowText(text: string): ProductFlow | undefined {
  try {
    return parseProductFlowText(text).flow;
  } catch {
    return undefined;
  }
}

export function serializeProductFlow(flow: ProductFlow): string {
  const { flow: normalized } = normalizeProductFlow(flow);
  const validation = validateProductFlow(normalized);
  if (!validation.valid) {
    throw new Error(`Cannot serialize invalid ProductFlow:\n${validation.errors.join("\n")}`);
  }
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function normalizeProductFlow(value: unknown): { flow: ProductFlow; migrated: boolean } {
  if (!isRecord(value)) {
    return { flow: value as ProductFlow, migrated: false };
  }

  const next: Record<string, unknown> = { ...value };
  let migrated = false;

  const previousVersion = typeof next.schemaVersion === "string" ? next.schemaVersion : "";
  if (previousVersion !== CURRENT_PRODUCT_FLOW_SCHEMA_VERSION) {
    next.schemaVersion = CURRENT_PRODUCT_FLOW_SCHEMA_VERSION;
    migrated = true;
  }

  const beforeOverview = JSON.stringify(next.projectOverview ?? null);
  ensureProjectOverview(next as unknown as ProductFlow);
  if (JSON.stringify(next.projectOverview ?? null) !== beforeOverview) {
    migrated = true;
  }

  migrated = stripKeys(next, LEGACY_FLOW_KEYS) || migrated;

  if (Array.isArray(next.nodes)) {
    const cleanedNodes = next.nodes.map((node) => cleanRecord(node, LEGACY_NODE_KEYS));
    if (!sameArrayItems(next.nodes, cleanedNodes)) {
      migrated = true;
      next.nodes = cleanedNodes;
    }
  }

  if (Array.isArray(next.edges)) {
    const cleanedEdges = next.edges.map((edge) => cleanRecord(edge, LEGACY_EDGE_KEYS));
    if (!sameArrayItems(next.edges, cleanedEdges)) {
      migrated = true;
      next.edges = cleanedEdges;
    }
  }

  return { flow: next as unknown as ProductFlow, migrated };
}

function cleanRecord(value: unknown, keys: string[]): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = { ...value };
  return stripKeys(next, keys) ? next : value;
}

function stripKeys(record: Record<string, unknown>, keys: string[]): boolean {
  let changed = false;
  for (const key of keys) {
    if (key in record) {
      delete record[key];
      changed = true;
    }
  }
  return changed;
}

function sameArrayItems(left: unknown[], right: unknown[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
