import { isFlowEndpointKind } from "../model/guards";
import { readFeatureGroups } from "./collections";
import { isRecord, requireString } from "./primitives";

export function checkEndpoint(
  value: unknown,
  path: string,
  nodeIds: Set<string>,
  nodesById: Map<string, Record<string, unknown>>,
  appSurfaceIds: Set<string>,
  errors: string[]
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  requireString(value, "kind", errors, path);
  if (!isFlowEndpointKind(value.kind)) {
    errors.push(`${path}.kind must be appSurface, projectOverview, node, featureGroup, or featureItem.`);
    return;
  }
  if (value.kind === "projectOverview") {
    requireString(value, "nodeId", errors, path);
    if (typeof value.nodeId === "string" && value.nodeId !== "projectOverview") {
      errors.push(`${path}.nodeId must be projectOverview for project overview endpoints.`);
    }
    return;
  }
  if (value.kind === "appSurface") {
    const appId = typeof value.appId === "string" ? value.appId : typeof value.nodeId === "string" ? value.nodeId : "";
    if (!appId) {
      errors.push(`${path}.appId must be a string.`);
    } else if (!appSurfaceIds.has(appId)) {
      errors.push(`${path}.appId references missing app surface ${appId}`);
    }
    return;
  }
  requireString(value, "nodeId", errors, path);
  if (typeof value.nodeId === "string" && !nodeIds.has(value.nodeId)) {
    errors.push(`${path}.nodeId references missing node ${value.nodeId}`);
  }
  if (value.kind === "node" || typeof value.nodeId !== "string") {
    return;
  }

  const node = nodesById.get(value.nodeId);
  const groups = node ? readFeatureGroups(node) : [];
  requireString(value, "groupId", errors, path);
  const groupId = typeof value.groupId === "string" ? value.groupId : "";
  const group = groups.find((item) => item.groupId === groupId);
  if (groupId && !group) {
    errors.push(`${path}.groupId references missing feature group ${groupId}`);
  }
  if (value.kind === "featureItem") {
    requireString(value, "itemId", errors, path);
    const itemId = typeof value.itemId === "string" ? value.itemId : "";
    if (group && itemId && !group.items.some((item) => item.itemId === itemId)) {
      errors.push(`${path}.itemId references missing feature item ${itemId}`);
    }
  }
}

export function appSurfaceIdsFromFlow(flow: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(flow.appSurfaces)) {
    return ids;
  }
  for (const surface of flow.appSurfaces) {
    if (isRecord(surface) && typeof surface.appId === "string") {
      ids.add(surface.appId);
    }
  }
  return ids;
}

export function isProjectOverviewEndpoint(value: unknown, legacyId: string): boolean {
  return legacyId === "projectOverview" && isRecord(value) && value.kind === "projectOverview";
}

export function isAppSurfaceEndpoint(value: unknown, legacyId: string): boolean {
  return isRecord(value) && value.kind === "appSurface" && (value.appId === legacyId || value.nodeId === legacyId);
}
