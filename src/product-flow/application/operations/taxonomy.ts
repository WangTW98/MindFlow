import { applyTaxonomyRequest, type TaxonomyKind, type TaxonomyRequest } from "../../domain/editing/taxonomy";
import type { ProductFlow } from "../../domain";
import { readOptionalString } from "./helpers";
import { taxonomySelectionPatch } from "./selection";
import type { FlowOperation, FlowOperationResult } from "./types";

type TaxonomyOperation = Extract<FlowOperation, { type: "taxonomy.upsert" | "taxonomy.remove" }>;

export function applyTaxonomyOperation(flow: ProductFlow, operation: TaxonomyOperation): FlowOperationResult {
  if (operation.type === "taxonomy.upsert") {
    const taxonomy = upsertTaxonomyInFlow(flow, operation.kind, operation.id, operation.item);
    return {
      type: operation.type,
      taxonomy,
      selection: taxonomySelectionPatch(operation.kind, taxonomy.id)
    };
  }
  applyTaxonomyRequest(flow, { kind: operation.kind, action: "delete", id: operation.id });
  return {
    type: operation.type,
    taxonomy: { kind: operation.kind, id: operation.id, item: null },
    removedId: operation.id,
    selection: taxonomySelectionPatch(operation.kind, undefined)
  };
}

function upsertTaxonomyInFlow(flow: ProductFlow, kind: TaxonomyKind, id: string | undefined, item: Record<string, unknown> = {}): { kind: TaxonomyKind; id: string; item: unknown } {
  const resolvedId = id ?? taxonomyItemId(kind, item);
  const request: TaxonomyRequest = { kind, action: resolvedId ? "update" : "create", id: resolvedId, item };
  applyTaxonomyRequest(flow, request);
  const resolved = findTaxonomyItem(flow, kind, resolvedId, readOptionalString(item, "name") ?? readOptionalString(item, "title"));
  if (!resolved) {
    throw new Error(`Unable to resolve taxonomy item after upsert: ${kind}`);
  }
  return { kind, id: resolved.id, item: resolved.item };
}

function findTaxonomyItem(flow: ProductFlow, kind: TaxonomyKind, id: string | undefined, name: string | undefined): { id: string; item: unknown } | undefined {
  if (kind === "domain") {
    const item = id ? flow.domains.find((candidate) => candidate.domainId === id) : flow.domains.find((candidate) => candidate.name === name);
    return item ? { id: item.domainId, item } : undefined;
  }
  if (kind === "role") {
    const item = id ? flow.roles.find((candidate) => candidate.roleId === id) : flow.roles.find((candidate) => candidate.name === name);
    return item ? { id: item.roleId, item } : undefined;
  }
  if (kind === "appSurface") {
    const item = id ? flow.appSurfaces?.find((candidate) => candidate.appId === id) : flow.appSurfaces?.find((candidate) => candidate.name === name);
    return item ? { id: item.appId, item } : undefined;
  }
  const item = id ? flow.statusGroups?.find((candidate) => candidate.statusGroupId === id) : flow.statusGroups?.find((candidate) => candidate.title === name);
  return item ? { id: item.statusGroupId, item } : undefined;
}

function taxonomyItemId(kind: TaxonomyKind, item: Record<string, unknown>): string | undefined {
  if (kind === "domain") {
    return readOptionalString(item, "domainId");
  }
  if (kind === "role") {
    return readOptionalString(item, "roleId");
  }
  if (kind === "appSurface") {
    return readOptionalString(item, "appId");
  }
  return readOptionalString(item, "statusGroupId");
}
