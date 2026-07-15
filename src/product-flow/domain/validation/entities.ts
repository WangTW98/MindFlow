import { APP_SURFACE_TYPES, EDGE_TYPES } from "../model/constants";
import { isAppSurfaceType, isEdgeType } from "../model/guards";
import { validateExceptions, validateFeatureGroups, validateOptionalViewPosition, validateStates } from "./collections";
import { appSurfaceIdsFromFlow, checkEndpoint, isAppSurfaceEndpoint, isProjectOverviewEndpoint } from "./endpoints";
import {
  isRecord,
  rejectUnknownKeys,
  requireArray,
  requireIsoDateString,
  requireNonEmptyString,
  requirePositiveInteger,
  requireString,
  requireStringArray,
  validateEntityStatus,
  validateReferences
} from "./primitives";

export interface NodeValidationIndex {
  nodeIds: Set<string>;
  nodesById: Map<string, Record<string, unknown>>;
}

export function validateProjectOverview(flow: Record<string, unknown>, errors: string[]): void {
  if (isRecord(flow.projectOverview)) {
    rejectUnknownKeys(flow.projectOverview, ["summary", "goal", "view"], "projectOverview", errors);
    requireNonEmptyString(flow.projectOverview, "summary", errors, "projectOverview");
    requireString(flow.projectOverview, "goal", errors, "projectOverview");
    validateOptionalViewPosition(flow.projectOverview.view, "projectOverview.view", errors);
  }
}

export function validateDomains(flow: Record<string, unknown>, errors: string[]): Set<string> {
  const domainIds = new Set<string>();
  const domains = Array.isArray(flow.domains) ? flow.domains : [];
  for (const [index, domain] of domains.entries()) {
    if (!isRecord(domain)) {
      errors.push(`domains[${index}] must be an object.`);
      continue;
    }
    rejectUnknownKeys(domain, ["domainId", "name", "description"], `domains[${index}]`, errors);
    requireNonEmptyString(domain, "domainId", errors, `domains[${index}]`);
    requireNonEmptyString(domain, "name", errors, `domains[${index}]`);
    requireString(domain, "description", errors, `domains[${index}]`);
    if (typeof domain.domainId === "string") {
      if (domainIds.has(domain.domainId)) {
        errors.push(`Duplicate domainId: ${domain.domainId}`);
      }
      domainIds.add(domain.domainId);
    }
  }
  return domainIds;
}

export function validateRoles(flow: Record<string, unknown>, domainIds: Set<string>, errors: string[]): Set<string> {
  const roleIds = new Set<string>();
  const roles = Array.isArray(flow.roles) ? flow.roles : [];
  for (const [index, role] of roles.entries()) {
    if (!isRecord(role)) {
      errors.push(`roles[${index}] must be an object.`);
      continue;
    }
    rejectUnknownKeys(role, ["roleId", "name", "description", "domainIds"], `roles[${index}]`, errors);
    requireNonEmptyString(role, "roleId", errors, `roles[${index}]`);
    requireNonEmptyString(role, "name", errors, `roles[${index}]`);
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
  return roleIds;
}

export function validateNodes(flow: Record<string, unknown>, domainIds: Set<string>, roleIds: Set<string>, errors: string[], warnings: string[]): NodeValidationIndex {
  const nodeIds = new Set<string>();
  const nodesById = new Map<string, Record<string, unknown>>();
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const appSurfaceIds = appSurfaceIdsFromFlow(flow);
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node)) {
      errors.push(`nodes[${index}] must be an object.`);
      continue;
    }
    rejectUnknownKeys(node, [
      "nodeId", "stableKey", "status", "version", "title", "pageType", "appSurfaceIds", "statusGroupId",
      "domainIds", "roleIds", "purpose", "featureGroups", "states", "exceptions",
      "inputs", "outputs", "permissions", "replacementNodeIds", "removedAt", "view"
    ], `nodes[${index}]`, errors);
    requireNonEmptyString(node, "nodeId", errors, `nodes[${index}]`);
    requireNonEmptyString(node, "stableKey", errors, `nodes[${index}]`);
    requireNonEmptyString(node, "status", errors, `nodes[${index}]`);
    validateEntityStatus(node.status, `nodes[${index}].status`, errors);
    requirePositiveInteger(node, "version", errors, `nodes[${index}]`);
    requireNonEmptyString(node, "title", errors, `nodes[${index}]`);
    requireNonEmptyString(node, "pageType", errors, `nodes[${index}]`);
    const nodeAppSurfaceIds = requireStringArray(node, "appSurfaceIds", errors, `nodes[${index}]`);
    validateReferences(nodeAppSurfaceIds, appSurfaceIds, `nodes[${index}].appSurfaceIds`, "app surface", errors);
    const nodeDomainIds = requireStringArray(node, "domainIds", errors, `nodes[${index}]`);
    const nodeRoleIds = requireStringArray(node, "roleIds", errors, `nodes[${index}]`);
    validateReferences(nodeDomainIds, domainIds, `nodes[${index}].domainIds`, "domain", errors);
    validateReferences(nodeRoleIds, roleIds, `nodes[${index}].roleIds`, "role", errors);
    requireNonEmptyString(node, "purpose", errors, `nodes[${index}]`);
    requireArray(node, "featureGroups", errors, `nodes[${index}]`);
    validateFeatureGroups(node.featureGroups, `nodes[${index}].featureGroups`, errors);
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
      requireIsoDateString(node, "removedAt", errors, `nodes[${index}]`);
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
  return { nodeIds, nodesById };
}

export function validateAppSurfaces(flow: Record<string, unknown>, domainIds: Set<string>, roleIds: Set<string>, errors: string[]): Set<string> {
  const appSurfaceIds = new Set<string>();
  if (!Array.isArray(flow.appSurfaces)) {
    return appSurfaceIds;
  }
  for (const [index, surface] of flow.appSurfaces.entries()) {
    if (!isRecord(surface)) {
      errors.push(`appSurfaces[${index}] must be an object.`);
      continue;
    }
    rejectUnknownKeys(surface, ["appId", "name", "type", "description", "domainIds", "roleIds", "view"], `appSurfaces[${index}]`, errors);
    requireNonEmptyString(surface, "appId", errors, `appSurfaces[${index}]`);
    requireNonEmptyString(surface, "name", errors, `appSurfaces[${index}]`);
    requireNonEmptyString(surface, "type", errors, `appSurfaces[${index}]`);
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
  return appSurfaceIds;
}

export function validateStatusGroups(flow: Record<string, unknown>, errors: string[]): Set<string> {
  const statusGroupIds = new Set<string>();
  if (!Array.isArray(flow.statusGroups)) {
    return statusGroupIds;
  }
  for (const [index, group] of flow.statusGroups.entries()) {
    if (!isRecord(group)) {
      errors.push(`statusGroups[${index}] must be an object.`);
      continue;
    }
    rejectUnknownKeys(group, ["statusGroupId", "title", "description", "color"], `statusGroups[${index}]`, errors);
    requireNonEmptyString(group, "statusGroupId", errors, `statusGroups[${index}]`);
    requireNonEmptyString(group, "title", errors, `statusGroups[${index}]`);
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
  return statusGroupIds;
}

export function validateNodeStatusGroups(flow: Record<string, unknown>, statusGroupIds: Set<string>, errors: string[]): void {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node) || node.statusGroupId === undefined) {
      continue;
    }
    requireNonEmptyString(node, "statusGroupId", errors, `nodes[${index}]`);
    if (typeof node.statusGroupId === "string" && node.statusGroupId && !statusGroupIds.has(node.statusGroupId)) {
      errors.push(`nodes[${index}].statusGroupId references missing status group ${node.statusGroupId}.`);
    }
  }
}

export function validateNodeReferences(flow: Record<string, unknown>, nodeIndex: NodeValidationIndex, errors: string[]): void {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node)) {
      continue;
    }
    const nodeId = typeof node.nodeId === "string" ? node.nodeId : "";
    if (Array.isArray(node.replacementNodeIds)) {
      for (const replacementId of node.replacementNodeIds) {
        if (typeof replacementId !== "string") {
          continue;
        }
        if (replacementId === nodeId) {
          errors.push(`nodes[${index}].replacementNodeIds cannot reference the node itself.`);
        } else if (!nodeIndex.nodeIds.has(replacementId)) {
          errors.push(`nodes[${index}].replacementNodeIds references missing node ${replacementId}.`);
        }
      }
    }
    if (Array.isArray(node.featureGroups)) {
      for (const [groupIndex, group] of node.featureGroups.entries()) {
        if (isRecord(group)) {
          validateActionTargets(group.actions, `nodes[${index}].featureGroups[${groupIndex}].actions`, nodeIndex, errors);
        }
      }
    }
  }
}

export function validateEdges(
  flow: Record<string, unknown>,
  nodeIndex: NodeValidationIndex,
  appSurfaceIds: Set<string>,
  domainIds: Set<string>,
  roleIds: Set<string>,
  errors: string[]
): void {
  const edgeIds = new Set<string>();
  const edges = Array.isArray(flow.edges) ? flow.edges : [];
  for (const [index, edge] of edges.entries()) {
    if (!isRecord(edge)) {
      errors.push(`edges[${index}] must be an object.`);
      continue;
    }
    rejectUnknownKeys(edge, [
      "edgeId", "status", "fromNodeId", "toNodeId", "from", "to", "action", "trigger", "type", "condition",
      "appSurfaceIds", "domainIds", "roleIds", "removedAt"
    ], `edges[${index}]`, errors);
    requireNonEmptyString(edge, "edgeId", errors, `edges[${index}]`);
    requireNonEmptyString(edge, "status", errors, `edges[${index}]`);
    validateEntityStatus(edge.status, `edges[${index}].status`, errors);
    requireNonEmptyString(edge, "fromNodeId", errors, `edges[${index}]`);
    requireNonEmptyString(edge, "toNodeId", errors, `edges[${index}]`);
    requireNonEmptyString(edge, "action", errors, `edges[${index}]`);
    if (edge.trigger !== undefined) {
      requireString(edge, "trigger", errors, `edges[${index}]`);
    }
    requireNonEmptyString(edge, "type", errors, `edges[${index}]`);
    if (!isEdgeType(edge.type)) {
      errors.push(`edges[${index}].type must be ${EDGE_TYPES.join(", ")}.`);
    }
    if (edge.condition !== undefined) {
      requireString(edge, "condition", errors, `edges[${index}]`);
    }
    const edgeAppSurfaceIds = requireStringArray(edge, "appSurfaceIds", errors, `edges[${index}]`);
    validateReferences(edgeAppSurfaceIds, appSurfaceIds, `edges[${index}].appSurfaceIds`, "app surface", errors);
    const edgeDomainIds = requireStringArray(edge, "domainIds", errors, `edges[${index}]`);
    const edgeRoleIds = requireStringArray(edge, "roleIds", errors, `edges[${index}]`);
    validateReferences(edgeDomainIds, domainIds, `edges[${index}].domainIds`, "domain", errors);
    validateReferences(edgeRoleIds, roleIds, `edges[${index}].roleIds`, "role", errors);
    if (edge.removedAt !== undefined) {
      requireIsoDateString(edge, "removedAt", errors, `edges[${index}]`);
    }
    if (typeof edge.edgeId === "string") {
      if (edgeIds.has(edge.edgeId)) {
        errors.push(`Duplicate edgeId: ${edge.edgeId}`);
      }
      edgeIds.add(edge.edgeId);
    }
    if (typeof edge.fromNodeId === "string" && !isProjectOverviewEndpoint(edge.from) && !isAppSurfaceEndpoint(edge.from) && !nodeIndex.nodeIds.has(edge.fromNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing fromNodeId ${edge.fromNodeId}`);
    }
    if (typeof edge.toNodeId === "string" && !isProjectOverviewEndpoint(edge.to) && !isAppSurfaceEndpoint(edge.to) && !nodeIndex.nodeIds.has(edge.toNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing toNodeId ${edge.toNodeId}`);
    }
    checkEndpoint(edge.from, `edges[${index}].from`, nodeIndex.nodeIds, nodeIndex.nodesById, appSurfaceIds, errors);
    checkEndpoint(edge.to, `edges[${index}].to`, nodeIndex.nodeIds, nodeIndex.nodesById, appSurfaceIds, errors);
    validateEdgeConsistency(flow, edge, index, nodeIndex, errors);
  }
}

function validateActionTargets(value: unknown, path: string, nodeIndex: NodeValidationIndex, errors: string[]): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const [index, action] of value.entries()) {
    if (!isRecord(action) || action.targetNodeId === undefined || typeof action.targetNodeId !== "string") {
      continue;
    }
    const target = nodeIndex.nodesById.get(action.targetNodeId);
    if (!target) {
      errors.push(`${path}[${index}].targetNodeId references missing node ${action.targetNodeId}.`);
    } else if (target.status === "removed") {
      errors.push(`${path}[${index}].targetNodeId references removed node ${action.targetNodeId}.`);
    }
  }
}

function validateEdgeConsistency(
  flow: Record<string, unknown>,
  edge: Record<string, unknown>,
  index: number,
  nodeIndex: NodeValidationIndex,
  errors: string[]
): void {
  const fromId = endpointStorageId(edge.from);
  const toId = endpointStorageId(edge.to);
  if (fromId && edge.fromNodeId !== fromId) {
    errors.push(`edges[${index}].fromNodeId must match the from endpoint.`);
  }
  if (toId && edge.toNodeId !== toId) {
    errors.push(`edges[${index}].toNodeId must match the to endpoint.`);
  }

  if (edge.status === "active") {
    for (const [side, endpoint] of [["from", edge.from], ["to", edge.to]] as const) {
      if (!isRecord(endpoint) || endpoint.kind === "appSurface" || endpoint.kind === "projectOverview") {
        continue;
      }
      const node = typeof endpoint.nodeId === "string" ? nodeIndex.nodesById.get(endpoint.nodeId) : undefined;
      if (node?.status === "removed") {
        errors.push(`edges[${index}].${side} references removed node ${String(endpoint.nodeId)}.`);
      }
    }
  }

  validateDerivedEdgeField(flow, edge, index, "appSurfaceIds", nodeIndex, errors);
  validateDerivedEdgeField(flow, edge, index, "domainIds", nodeIndex, errors);
  validateDerivedEdgeField(flow, edge, index, "roleIds", nodeIndex, errors);
}

function endpointStorageId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.kind === "projectOverview") {
    return "projectOverview";
  }
  if (value.kind === "appSurface") {
    return typeof value.appId === "string" ? value.appId : undefined;
  }
  return typeof value.nodeId === "string" ? value.nodeId : undefined;
}

function validateDerivedEdgeField(
  flow: Record<string, unknown>,
  edge: Record<string, unknown>,
  index: number,
  field: "appSurfaceIds" | "domainIds" | "roleIds",
  nodeIndex: NodeValidationIndex,
  errors: string[]
): void {
  const expected = uniqueStrings([
    ...endpointTaxonomyIds(flow, edge.from, field, nodeIndex),
    ...endpointTaxonomyIds(flow, edge.to, field, nodeIndex)
  ]);
  const actual = Array.isArray(edge[field]) ? uniqueStrings(edge[field].filter((item): item is string => typeof item === "string")) : [];
  if (!sameStringSet(actual, expected)) {
    errors.push(`edges[${index}].${field} must be derived from the edge endpoints.`);
  }
}

function endpointTaxonomyIds(
  flow: Record<string, unknown>,
  endpoint: unknown,
  field: "appSurfaceIds" | "domainIds" | "roleIds",
  nodeIndex: NodeValidationIndex
): string[] {
  if (!isRecord(endpoint) || endpoint.kind === "projectOverview") {
    return [];
  }
  if (endpoint.kind === "appSurface") {
    const appId = typeof endpoint.appId === "string" ? endpoint.appId : "";
    if (field === "appSurfaceIds") {
      return appId ? [appId] : [];
    }
    const surfaces = Array.isArray(flow.appSurfaces) ? flow.appSurfaces : [];
    const surface = surfaces.find((item) => isRecord(item) && item.appId === appId);
    return surface && Array.isArray(surface[field]) ? surface[field].filter((item): item is string => typeof item === "string") : [];
  }
  const node = typeof endpoint.nodeId === "string" ? nodeIndex.nodesById.get(endpoint.nodeId) : undefined;
  return node && Array.isArray(node[field]) ? node[field].filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}
