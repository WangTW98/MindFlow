import type { ProductFlow, ValidationResult } from "../model/types";
import {
  validateAppSurfaces,
  validateDomains,
  validateEdges,
  validateNodeStatusGroups,
  validateNodeReferences,
  validateNodes,
  validateProjectOverview,
  validateRoles,
  validateStatusGroups
} from "./entities";
import { isRecord, rejectUnknownKeys, requireArray, requireIsoDateString, requireNonEmptyString, requireObject, requirePositiveInteger } from "./primitives";

export function validateProductFlow(flow: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(flow)) {
    return { valid: false, errors: ["ProductFlow must be an object."], warnings };
  }

  rejectUnknownKeys(flow, [
    "flowId", "revision", "title", "createdAt", "updatedAt", "projectOverview",
    "domains", "roles", "appSurfaces", "statusGroups", "nodes", "edges"
  ], "", errors);

  requireNonEmptyString(flow, "flowId", errors);
  requirePositiveInteger(flow, "revision", errors);
  requireNonEmptyString(flow, "title", errors);
  requireIsoDateString(flow, "createdAt", errors);
  requireIsoDateString(flow, "updatedAt", errors);
  requireObject(flow, "projectOverview", errors);
  requireArray(flow, "domains", errors);
  requireArray(flow, "roles", errors);
  requireArray(flow, "appSurfaces", errors);
  requireArray(flow, "statusGroups", errors);
  requireArray(flow, "nodes", errors);
  requireArray(flow, "edges", errors);

  if (!Array.isArray(flow.domains) || !Array.isArray(flow.roles) || !Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    return { valid: errors.length === 0, errors, warnings };
  }

  validateProjectOverview(flow, errors);
  const domainIds = validateDomains(flow, errors);
  const roleIds = validateRoles(flow, domainIds, errors);
  const nodeIndex = validateNodes(flow, domainIds, roleIds, errors, warnings);
  const appSurfaceIds = validateAppSurfaces(flow, domainIds, roleIds, errors);
  const statusGroupIds = validateStatusGroups(flow, errors);
  validateNodeStatusGroups(flow, statusGroupIds, errors);
  validateNodeReferences(flow, nodeIndex, errors);
  validateEdges(flow, nodeIndex, appSurfaceIds, domainIds, roleIds, errors);
  validateGlobalEntityIds(flow, errors);

  const activeNodes = flow.nodes.filter((node) => isRecord(node) && node.status === "active");
  if (activeNodes.length === 0) {
    warnings.push("ProductFlow has no active nodes.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateGlobalEntityIds(flow: Record<string, unknown>, errors: string[]): void {
  const seen = new Map<string, string>();
  const register = (value: unknown, path: string): void => {
    if (typeof value !== "string" || !value.trim()) {
      return;
    }
    const previous = seen.get(value);
    if (previous) {
      errors.push(`${path} duplicates entity id ${value} already used by ${previous}.`);
    } else {
      seen.set(value, path);
    }
  };

  register(flow.flowId, "flowId");
  for (const [index, domain] of records(flow.domains)) {
    register(domain.domainId, `domains[${index}].domainId`);
  }
  for (const [index, role] of records(flow.roles)) {
    register(role.roleId, `roles[${index}].roleId`);
  }
  for (const [index, surface] of records(flow.appSurfaces)) {
    register(surface.appId, `appSurfaces[${index}].appId`);
  }
  for (const [index, group] of records(flow.statusGroups)) {
    register(group.statusGroupId, `statusGroups[${index}].statusGroupId`);
  }
  for (const [nodeIndex, node] of records(flow.nodes)) {
    register(node.nodeId, `nodes[${nodeIndex}].nodeId`);
  }
  for (const [index, edge] of records(flow.edges)) {
    register(edge.edgeId, `edges[${index}].edgeId`);
  }
}

function records(value: unknown): Array<[number, Record<string, unknown>]> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item, index) => isRecord(item) ? [[index, item] as [number, Record<string, unknown>]] : []);
}

export function isProductFlow(flow: unknown): flow is ProductFlow {
  return validateProductFlow(flow).valid;
}
