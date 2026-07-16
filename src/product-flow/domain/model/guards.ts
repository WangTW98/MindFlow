import { APP_SURFACE_TYPES, EDGE_TYPES, ENTITY_STATUSES, FLOW_ENDPOINT_KINDS, type AppSurfaceType, type EdgeType, type EntityStatus, type FlowEndpointKind } from "./constants";

const ENTITY_STATUS_VALUES = new Set<string>(ENTITY_STATUSES);
const EDGE_TYPE_VALUES = new Set<string>(EDGE_TYPES);
const APP_SURFACE_TYPE_VALUES = new Set<string>(APP_SURFACE_TYPES);
const FLOW_ENDPOINT_KIND_VALUES = new Set<string>(FLOW_ENDPOINT_KINDS);

export function isEntityStatus(value: unknown): value is EntityStatus {
  return typeof value === "string" && ENTITY_STATUS_VALUES.has(value);
}

export function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === "string" && EDGE_TYPE_VALUES.has(value);
}

export function isAppSurfaceType(value: unknown): value is AppSurfaceType {
  return typeof value === "string" && APP_SURFACE_TYPE_VALUES.has(value);
}

export function isFlowEndpointKind(value: unknown): value is FlowEndpointKind {
  return typeof value === "string" && FLOW_ENDPOINT_KIND_VALUES.has(value);
}
