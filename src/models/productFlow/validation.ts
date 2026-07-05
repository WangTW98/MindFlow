import { APP_SURFACE_TYPES, CURRENT_SCHEMA_VERSION, EDGE_TYPES, ENTITY_STATUSES } from "./constants";
import { isAppSurfaceType, isEdgeType, isEntityStatus, isFlowEndpointKind } from "./guards";
import type { ProductFlow, ValidationResult } from "./types";

export function validateProductFlow(flow: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(flow)) {
    return { valid: false, errors: ["ProductFlow must be an object."], warnings };
  }

  requireString(flow, "schemaVersion", errors);
  requireString(flow, "flowId", errors);
  requireNumber(flow, "revision", errors);
  requireString(flow, "title", errors);
  requireString(flow, "createdAt", errors);
  requireString(flow, "updatedAt", errors);
  requireObject(flow, "projectOverview", errors);
  requireArray(flow, "domains", errors);
  requireArray(flow, "roles", errors);
  if ("appSurfaces" in flow) {
    requireArray(flow, "appSurfaces", errors);
  }
  if ("statusGroups" in flow) {
    requireArray(flow, "statusGroups", errors);
  }
  requireArray(flow, "nodes", errors);
  requireArray(flow, "edges", errors);

  if (typeof flow.schemaVersion === "string" && flow.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CURRENT_SCHEMA_VERSION}.`);
  }

  if (!Array.isArray(flow.domains) || !Array.isArray(flow.roles) || !Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    return { valid: errors.length === 0, errors, warnings };
  }

  if (isRecord(flow.projectOverview)) {
    requireString(flow.projectOverview, "summary", errors, "projectOverview");
    requireString(flow.projectOverview, "goal", errors, "projectOverview");
    validateOptionalViewPosition(flow.projectOverview.view, "projectOverview.view", errors);
  }

  const domainIds = new Set<string>();
  for (const [index, domain] of flow.domains.entries()) {
    if (!isRecord(domain)) {
      errors.push(`domains[${index}] must be an object.`);
      continue;
    }
    requireString(domain, "domainId", errors, `domains[${index}]`);
    requireString(domain, "name", errors, `domains[${index}]`);
    requireString(domain, "description", errors, `domains[${index}]`);
    if (typeof domain.domainId === "string") {
      if (domainIds.has(domain.domainId)) {
        errors.push(`Duplicate domainId: ${domain.domainId}`);
      }
      domainIds.add(domain.domainId);
    }
  }

  const roleIds = new Set<string>();
  for (const [index, role] of flow.roles.entries()) {
    if (!isRecord(role)) {
      errors.push(`roles[${index}] must be an object.`);
      continue;
    }
    requireString(role, "roleId", errors, `roles[${index}]`);
    requireString(role, "name", errors, `roles[${index}]`);
    requireString(role, "description", errors, `roles[${index}]`);
    const roleDomainIds = requireStringArray(role, "domainIds", errors, `roles[${index}]`);
    validateReferences(roleDomainIds, domainIds, `roles[${index}].domainIds`, "domain", errors);
    if (typeof role.roleId === "string") {
      if (roleIds.has(role.roleId)) {
        errors.push(`Duplicate roleId: ${role.roleId}`);
      }
      roleIds.add(role.roleId);
    }
  }

  const nodeIds = new Set<string>();
  const nodesById = new Map<string, Record<string, unknown>>();
  for (const [index, node] of flow.nodes.entries()) {
    if (!isRecord(node)) {
      errors.push(`nodes[${index}] must be an object.`);
      continue;
    }
    requireString(node, "nodeId", errors, `nodes[${index}]`);
    requireString(node, "stableKey", errors, `nodes[${index}]`);
    requireString(node, "status", errors, `nodes[${index}]`);
    validateEntityStatus(node.status, `nodes[${index}].status`, errors);
    requireNumber(node, "version", errors, `nodes[${index}]`);
    requireString(node, "title", errors, `nodes[${index}]`);
    requireString(node, "pageType", errors, `nodes[${index}]`);
    const nodeAppSurfaceIds = "appSurfaceIds" in node ? requireStringArray(node, "appSurfaceIds", errors, `nodes[${index}]`) : [];
    validateReferences(nodeAppSurfaceIds, appSurfaceIdsFromFlow(flow), `nodes[${index}].appSurfaceIds`, "app surface", errors);
    if ("appSurfaceIds" in node) {
      requireArray(node, "appSurfaceIds", errors, `nodes[${index}]`);
    }
    const nodeDomainIds = requireStringArray(node, "domainIds", errors, `nodes[${index}]`);
    const nodeRoleIds = requireStringArray(node, "roleIds", errors, `nodes[${index}]`);
    validateReferences(nodeDomainIds, domainIds, `nodes[${index}].domainIds`, "domain", errors);
    validateReferences(nodeRoleIds, roleIds, `nodes[${index}].roleIds`, "role", errors);
    requireString(node, "purpose", errors, `nodes[${index}]`);
    if ("featureGroups" in node) {
      requireArray(node, "featureGroups", errors, `nodes[${index}]`);
      validateFeatureGroups(node.featureGroups, `nodes[${index}].featureGroups`, errors);
    }
    validateElements(node.elements, `nodes[${index}].elements`, errors);
    validateActions(node.actions, `nodes[${index}].actions`, errors);
    validateStates(node.states, `nodes[${index}].states`, errors);
    validateExceptions(node.exceptions, `nodes[${index}].exceptions`, errors);
    requireStringArray(node, "inputs", errors, `nodes[${index}]`);
    requireStringArray(node, "outputs", errors, `nodes[${index}]`);
    const permissions = requireStringArray(node, "permissions", errors, `nodes[${index}]`);
    validateReferences(permissions, roleIds, `nodes[${index}].permissions`, "role", warnings);
    if ("replacementNodeIds" in node) {
      requireStringArray(node, "replacementNodeIds", errors, `nodes[${index}]`);
    }
    if ("removedAt" in node) {
      requireString(node, "removedAt", errors, `nodes[${index}]`);
    }
    validateOptionalViewPosition(node.view, `nodes[${index}].view`, errors);
    if (typeof node.nodeId === "string") {
      if (nodeIds.has(node.nodeId)) {
        errors.push(`Duplicate nodeId: ${node.nodeId}`);
      }
      nodeIds.add(node.nodeId);
      nodesById.set(node.nodeId, node);
    }
  }

  const appSurfaceIds = new Set<string>();
  if (Array.isArray(flow.appSurfaces)) {
    for (const [index, surface] of flow.appSurfaces.entries()) {
      if (!isRecord(surface)) {
        errors.push(`appSurfaces[${index}] must be an object.`);
        continue;
      }
      requireString(surface, "appId", errors, `appSurfaces[${index}]`);
      requireString(surface, "name", errors, `appSurfaces[${index}]`);
      requireString(surface, "type", errors, `appSurfaces[${index}]`);
      if (!isAppSurfaceType(surface.type)) {
        errors.push(`appSurfaces[${index}].type must be ${APP_SURFACE_TYPES.join(", ")}.`);
      }
      requireString(surface, "description", errors, `appSurfaces[${index}]`);
      const surfaceDomainIds = requireStringArray(surface, "domainIds", errors, `appSurfaces[${index}]`);
      const surfaceRoleIds = requireStringArray(surface, "roleIds", errors, `appSurfaces[${index}]`);
      validateReferences(surfaceDomainIds, domainIds, `appSurfaces[${index}].domainIds`, "domain", errors);
      validateReferences(surfaceRoleIds, roleIds, `appSurfaces[${index}].roleIds`, "role", errors);
      validateOptionalViewPosition(surface.view, `appSurfaces[${index}].view`, errors);
      if (typeof surface.appId === "string") {
        if (appSurfaceIds.has(surface.appId)) {
          errors.push(`Duplicate appId: ${surface.appId}`);
        }
        appSurfaceIds.add(surface.appId);
      }
    }
  }

  const statusGroupIds = new Set<string>();
  if (Array.isArray(flow.statusGroups)) {
    for (const [index, group] of flow.statusGroups.entries()) {
      if (!isRecord(group)) {
        errors.push(`statusGroups[${index}] must be an object.`);
        continue;
      }
      requireString(group, "statusGroupId", errors, `statusGroups[${index}]`);
      requireString(group, "title", errors, `statusGroups[${index}]`);
      if ("description" in group) {
        requireString(group, "description", errors, `statusGroups[${index}]`);
      }
      requireString(group, "color", errors, `statusGroups[${index}]`);
      if (typeof group.color === "string" && !/^#[0-9a-fA-F]{6}$/.test(group.color)) {
        errors.push(`statusGroups[${index}].color must be a #RRGGBB color.`);
      }
      if (typeof group.statusGroupId === "string") {
        if (statusGroupIds.has(group.statusGroupId)) {
          errors.push(`Duplicate statusGroupId: ${group.statusGroupId}`);
        }
        statusGroupIds.add(group.statusGroupId);
      }
    }
  }

  for (const [index, node] of flow.nodes.entries()) {
    if (!isRecord(node) || node.statusGroupId === undefined) {
      continue;
    }
    requireString(node, "statusGroupId", errors, `nodes[${index}]`);
    if (typeof node.statusGroupId === "string" && node.statusGroupId && !statusGroupIds.has(node.statusGroupId)) {
      warnings.push(`nodes[${index}].statusGroupId references missing status group ${node.statusGroupId}.`);
    }
  }

  const edgeIds = new Set<string>();
  for (const [index, edge] of flow.edges.entries()) {
    if (!isRecord(edge)) {
      errors.push(`edges[${index}] must be an object.`);
      continue;
    }
    requireString(edge, "edgeId", errors, `edges[${index}]`);
    requireString(edge, "status", errors, `edges[${index}]`);
    validateEntityStatus(edge.status, `edges[${index}].status`, errors);
    requireString(edge, "fromNodeId", errors, `edges[${index}]`);
    requireString(edge, "toNodeId", errors, `edges[${index}]`);
    requireString(edge, "action", errors, `edges[${index}]`);
    if (edge.trigger !== undefined) {
      requireString(edge, "trigger", errors, `edges[${index}]`);
    }
    requireString(edge, "type", errors, `edges[${index}]`);
    if (!isEdgeType(edge.type)) {
      errors.push(`edges[${index}].type must be ${EDGE_TYPES.join(", ")}.`);
    }
    if (edge.condition !== undefined) {
      requireString(edge, "condition", errors, `edges[${index}]`);
    }
    if (edge.appSurfaceIds !== undefined) {
      const edgeAppSurfaceIds = requireStringArray(edge, "appSurfaceIds", errors, `edges[${index}]`);
      validateReferences(edgeAppSurfaceIds, appSurfaceIds, `edges[${index}].appSurfaceIds`, "app surface", errors);
    }
    const edgeDomainIds = requireStringArray(edge, "domainIds", errors, `edges[${index}]`);
    const edgeRoleIds = requireStringArray(edge, "roleIds", errors, `edges[${index}]`);
    validateReferences(edgeDomainIds, domainIds, `edges[${index}].domainIds`, "domain", errors);
    validateReferences(edgeRoleIds, roleIds, `edges[${index}].roleIds`, "role", errors);
    if (edge.removedAt !== undefined) {
      requireString(edge, "removedAt", errors, `edges[${index}]`);
    }
    if (typeof edge.edgeId === "string") {
      if (edgeIds.has(edge.edgeId)) {
        errors.push(`Duplicate edgeId: ${edge.edgeId}`);
      }
      edgeIds.add(edge.edgeId);
    }
    if (typeof edge.fromNodeId === "string" && !isProjectOverviewEndpoint(edge.from, edge.fromNodeId) && !isAppSurfaceEndpoint(edge.from, edge.fromNodeId) && !nodeIds.has(edge.fromNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing fromNodeId ${edge.fromNodeId}`);
    }
    if (typeof edge.toNodeId === "string" && !isProjectOverviewEndpoint(edge.to, edge.toNodeId) && !isAppSurfaceEndpoint(edge.to, edge.toNodeId) && !nodeIds.has(edge.toNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing toNodeId ${edge.toNodeId}`);
    }
    checkEndpoint(edge.from, `edges[${index}].from`, nodeIds, nodesById, appSurfaceIds, errors);
    checkEndpoint(edge.to, `edges[${index}].to`, nodeIds, nodesById, appSurfaceIds, errors);
  }

  const activeNodes = flow.nodes.filter((node) => isRecord(node) && node.status === "active");
  if (activeNodes.length === 0) {
    warnings.push("ProductFlow has no active nodes.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function isProductFlow(flow: unknown): flow is ProductFlow {
  return validateProductFlow(flow).valid;
}

function checkEndpoint(
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

function appSurfaceIdsFromFlow(flow: Record<string, unknown>): Set<string> {
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

function validateFeatureGroups(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const groupIds = new Set<string>();
  for (const [index, group] of value.entries()) {
    const groupPath = `${path}[${index}]`;
    if (!isRecord(group)) {
      errors.push(`${groupPath} must be an object.`);
      continue;
    }
    requireString(group, "groupId", errors, groupPath);
    requireString(group, "name", errors, groupPath);
    requireString(group, "type", errors, groupPath);
    requireString(group, "description", errors, groupPath);
    if (typeof group.groupId === "string") {
      if (groupIds.has(group.groupId)) {
        errors.push(`Duplicate feature group id at ${groupPath}: ${group.groupId}`);
      }
      groupIds.add(group.groupId);
    }
    validateFeatureItems(group.items, `${groupPath}.items`, errors);
    if (group.actions !== undefined) {
      validateActions(group.actions, `${groupPath}.actions`, errors);
    }
  }
}

function validateFeatureItems(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const itemIds = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object.`);
      continue;
    }
    requireString(item, "itemId", errors, itemPath);
    requireString(item, "name", errors, itemPath);
    requireString(item, "type", errors, itemPath);
    requireString(item, "description", errors, itemPath);
    requireOptionalString(item, "dataBinding", errors, itemPath);
    requireOptionalBoolean(item, "required", errors, itemPath);
    if (typeof item.itemId === "string") {
      if (itemIds.has(item.itemId)) {
        errors.push(`Duplicate feature item id at ${itemPath}: ${item.itemId}`);
      }
      itemIds.add(item.itemId);
    }
  }
}

function validateElements(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const ids = new Set<string>();
  for (const [index, element] of value.entries()) {
    const elementPath = `${path}[${index}]`;
    if (!isRecord(element)) {
      errors.push(`${elementPath} must be an object.`);
      continue;
    }
    requireString(element, "elementId", errors, elementPath);
    requireString(element, "name", errors, elementPath);
    requireString(element, "type", errors, elementPath);
    requireString(element, "description", errors, elementPath);
    requireOptionalString(element, "dataBinding", errors, elementPath);
    requireOptionalBoolean(element, "required", errors, elementPath);
    if (typeof element.elementId === "string") {
      if (ids.has(element.elementId)) {
        errors.push(`Duplicate elementId at ${elementPath}: ${element.elementId}`);
      }
      ids.add(element.elementId);
    }
  }
}

function validateActions(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const ids = new Set<string>();
  for (const [index, action] of value.entries()) {
    const actionPath = `${path}[${index}]`;
    if (!isRecord(action)) {
      errors.push(`${actionPath} must be an object.`);
      continue;
    }
    requireString(action, "actionId", errors, actionPath);
    requireString(action, "label", errors, actionPath);
    requireString(action, "type", errors, actionPath);
    requireOptionalString(action, "targetNodeId", errors, actionPath);
    if ("preconditions" in action) {
      requireStringArray(action, "preconditions", errors, actionPath);
    }
    requireOptionalString(action, "result", errors, actionPath);
    if (typeof action.actionId === "string") {
      if (ids.has(action.actionId)) {
        errors.push(`Duplicate actionId at ${actionPath}: ${action.actionId}`);
      }
      ids.add(action.actionId);
    }
  }
}

function validateStates(value: unknown, path: string, errors: string[]): void {
  validateObjectArrayWithStrings(value, path, ["stateId", "name", "description"], "stateId", errors);
}

function validateExceptions(value: unknown, path: string, errors: string[]): void {
  validateObjectArrayWithStrings(value, path, ["exceptionId", "name", "handling"], "exceptionId", errors);
}

function validateObjectArrayWithStrings(
  value: unknown,
  path: string,
  keys: string[],
  idKey: string,
  errors: string[]
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object.`);
      continue;
    }
    for (const key of keys) {
      requireString(item, key, errors, itemPath);
    }
    const id = item[idKey];
    if (typeof id === "string") {
      if (ids.has(id)) {
        errors.push(`Duplicate ${idKey} at ${itemPath}: ${id}`);
      }
      ids.add(id);
    }
  }
}

function readFeatureGroups(node: Record<string, unknown>): Array<{ groupId: string; items: Array<{ itemId: string }> }> {
  if (!Array.isArray(node.featureGroups)) {
    return [];
  }
  return node.featureGroups.filter(isRecord).map((group) => ({
    groupId: typeof group.groupId === "string" ? group.groupId : "",
    items: Array.isArray(group.items)
      ? group.items.filter(isRecord).map((item) => ({ itemId: typeof item.itemId === "string" ? item.itemId : "" }))
      : []
  }));
}

function validateOptionalViewPosition(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (value.position === undefined) {
    return;
  }
  if (!isRecord(value.position)) {
    errors.push(`${path}.position must be an object.`);
    return;
  }
  requireNumber(value.position, "x", errors, `${path}.position`);
  requireNumber(value.position, "y", errors, `${path}.position`);
}

function validateEntityStatus(value: unknown, path: string, errors: string[]): void {
  if (typeof value === "string" && !isEntityStatus(value)) {
    errors.push(`${path} must be ${ENTITY_STATUSES.join(", ")}.`);
  }
}

function validateReferences(
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

function isProjectOverviewEndpoint(value: unknown, legacyId: string): boolean {
  return legacyId === "projectOverview" && isRecord(value) && value.kind === "projectOverview";
}

function isAppSurfaceEndpoint(value: unknown, legacyId: string): boolean {
  return isRecord(value) && value.kind === "appSurface" && (value.appId === legacyId || value.nodeId === legacyId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "string") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a string.`);
  }
}

function requireNumber(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a number.`);
  }
}

function requireArray(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!Array.isArray(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an array.`);
  }
}

function requireStringArray(obj: Record<string, unknown>, key: string, errors: string[], path?: string): string[] {
  const value = obj[key];
  const fullPath = `${path ? `${path}.` : ""}${key}`;
  if (!Array.isArray(value)) {
    errors.push(`${fullPath} must be an array.`);
    return [];
  }
  const strings: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      errors.push(`${fullPath}[${index}] must be a string.`);
      continue;
    }
    strings.push(item);
  }
  return strings;
}

function requireObject(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!isRecord(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an object.`);
  }
}

function requireOptionalString(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (obj[key] !== undefined && typeof obj[key] !== "string") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a string.`);
  }
}

function requireOptionalBoolean(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (obj[key] !== undefined && typeof obj[key] !== "boolean") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a boolean.`);
  }
}
