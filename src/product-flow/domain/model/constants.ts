export const ENTITY_STATUSES = ["active", "deprecated", "removed"] as const;
export type EntityStatus = typeof ENTITY_STATUSES[number];

export const EDGE_TYPES = [
  "interaction",
  "autoNavigate",
  "dataFlow",
  "statusChange",
  "nestedRelation"
] as const;
export type EdgeType = typeof EDGE_TYPES[number];

export const APP_SURFACE_TYPES = ["admin", "web", "app", "miniapp", "desktop", "other"] as const;
export type AppSurfaceType = typeof APP_SURFACE_TYPES[number];

export const NODE_PAGE_TYPES = ["skeleton", "navigation", "page", "popup", "component"] as const;
export type NodePageType = typeof NODE_PAGE_TYPES[number];

export const FLOW_ENDPOINT_KINDS = ["appSurface", "projectOverview", "node", "featureGroup", "featureItem"] as const;
export type FlowEndpointKind = typeof FLOW_ENDPOINT_KINDS[number];
