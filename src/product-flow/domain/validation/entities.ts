import { APP_SURFACE_TYPES, EDGE_TYPES } from "../model/constants";
import { isAppSurfaceType, isEdgeType } from "../model/guards";
import { validateActions, validateElements, validateExceptions, validateFeatureGroups, validateOptionalViewPosition, validateStates } from "./collections";
import { appSurfaceIdsFromFlow, checkEndpoint, isAppSurfaceEndpoint, isProjectOverviewEndpoint } from "./endpoints";
import { isRecord, requireArray, requireString, requireStringArray, validateEntityStatus, validateReferences } from "./primitives";

export interface NodeValidationIndex {
  nodeIds: Set<string>;
  nodesById: Map<string, Record<string, unknown>>;
}

export function validateProjectOverview(flow: Record<string, unknown>, errors: string[]): void {
  if (isRecord(flow.projectOverview)) {
    requireString(flow.projectOverview, "summary", errors, "projectOverview");
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
    requireString(node, "nodeId", errors, `nodes[${index}]`);
    requireString(node, "stableKey", errors, `nodes[${index}]`);
    requireString(node, "status", errors, `nodes[${index}]`);
    validateEntityStatus(node.status, `nodes[${index}].status`, errors);
    requireNumberFromRecord(node, "version", errors, `nodes[${index}]`);
    requireString(node, "title", errors, `nodes[${index}]`);
    requireString(node, "pageType", errors, `nodes[${index}]`);
    const nodeAppSurfaceIds = "appSurfaceIds" in node ? requireStringArray(node, "appSurfaceIds", errors, `nodes[${index}]`) : [];
    validateReferences(nodeAppSurfaceIds, appSurfaceIds, `nodes[${index}].appSurfaceIds`, "app surface", errors);
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
  return statusGroupIds;
}

export function validateNodeStatusGroups(flow: Record<string, unknown>, statusGroupIds: Set<string>, errors: string[], warnings: string[]): void {
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  for (const [index, node] of nodes.entries()) {
    if (!isRecord(node) || node.statusGroupId === undefined) {
      continue;
    }
    requireString(node, "statusGroupId", errors, `nodes[${index}]`);
    if (typeof node.statusGroupId === "string" && node.statusGroupId && !statusGroupIds.has(node.statusGroupId)) {
      warnings.push(`nodes[${index}].statusGroupId references missing status group ${node.statusGroupId}.`);
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
    if (typeof edge.fromNodeId === "string" && !isProjectOverviewEndpoint(edge.from, edge.fromNodeId) && !isAppSurfaceEndpoint(edge.from, edge.fromNodeId) && !nodeIndex.nodeIds.has(edge.fromNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing fromNodeId ${edge.fromNodeId}`);
    }
    if (typeof edge.toNodeId === "string" && !isProjectOverviewEndpoint(edge.to, edge.toNodeId) && !isAppSurfaceEndpoint(edge.to, edge.toNodeId) && !nodeIndex.nodeIds.has(edge.toNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing toNodeId ${edge.toNodeId}`);
    }
    checkEndpoint(edge.from, `edges[${index}].from`, nodeIndex.nodeIds, nodeIndex.nodesById, appSurfaceIds, errors);
    checkEndpoint(edge.to, `edges[${index}].to`, nodeIndex.nodeIds, nodeIndex.nodesById, appSurfaceIds, errors);
  }
}

function requireNumberFromRecord(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a number.`);
  }
}
