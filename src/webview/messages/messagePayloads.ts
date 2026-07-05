import type { TaxonomyRequest } from "../../core/taxonomy";
import { readEdgeType, readEndpoint } from "./endpointPayload";
import { isRecord, readOptionalNumber, readOptionalString, readOptionalStringArray, readRecord } from "./readers";

export function readConnectedNodeRequest(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = value.from === undefined ? undefined : readEndpoint(value.from);
  const to = value.to === undefined ? undefined : readEndpoint(value.to);
  if (!from && !to) {
    return undefined;
  }
  const type = value.type === undefined ? undefined : readEdgeType(value.type);
  if (value.type !== undefined && !type) {
    return undefined;
  }
  const appSurfaceIds = readOptionalStringArray(value, "appSurfaceIds");
  const domainIds = readOptionalStringArray(value, "domainIds");
  const roleIds = readOptionalStringArray(value, "roleIds");
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(typeof value.x === "number" && Number.isFinite(value.x) ? { x: value.x } : {}),
    ...(typeof value.y === "number" && Number.isFinite(value.y) ? { y: value.y } : {}),
    ...(typeof value.trigger === "string" ? { trigger: value.trigger } : {}),
    ...(type ? { type } : {}),
    ...(appSurfaceIds ? { appSurfaceIds } : {}),
    ...(domainIds ? { domainIds } : {}),
    ...(roleIds ? { roleIds } : {})
  };
}

export function readEdgeDetailsPatch(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const from = value.from === undefined ? undefined : readEndpoint(value.from);
  const to = value.to === undefined ? undefined : readEndpoint(value.to);
  const edgeType = value.type === undefined ? undefined : readEdgeType(value.type);
  if ((value.from !== undefined && !from) || (value.to !== undefined && !to) || (value.type !== undefined && !edgeType)) {
    return undefined;
  }
  const appSurfaceIds = readOptionalStringArray(value, "appSurfaceIds");
  const domainIds = readOptionalStringArray(value, "domainIds");
  const roleIds = readOptionalStringArray(value, "roleIds");
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(typeof value.trigger === "string" ? { trigger: value.trigger } : {}),
    ...(typeof value.action === "string" ? { action: value.action } : {}),
    ...(edgeType ? { type: edgeType } : {}),
    ...(typeof value.condition === "string" ? { condition: value.condition } : {}),
    ...(appSurfaceIds ? { appSurfaceIds } : {}),
    ...(domainIds ? { domainIds } : {}),
    ...(roleIds ? { roleIds } : {})
  };
}

export function readTaxonomyRequest(value: unknown): TaxonomyRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = value.kind;
  const action = value.action;
  if (kind !== "appSurface" && kind !== "domain" && kind !== "role" && kind !== "statusGroup") {
    return undefined;
  }
  if (action !== "create" && action !== "update" && action !== "delete") {
    return undefined;
  }
  const id = readOptionalString(value, "id");
  const item = readRecord(value, "item");
  if (action === "delete" && !id) {
    return undefined;
  }
  return { kind, action, ...(id ? { id } : {}), ...(item ? { item } : {}) };
}

export { readOptionalNumber };
