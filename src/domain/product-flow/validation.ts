import { CURRENT_SCHEMA_VERSION } from "./constants";
import type { ProductFlow, ValidationResult } from "./types";
import {
  validateAppSurfaces,
  validateDomains,
  validateEdges,
  validateNodeStatusGroups,
  validateNodes,
  validateProjectOverview,
  validateRoles,
  validateStatusGroups
} from "./validation/entities";
import { isRecord, requireArray, requireNumber, requireObject, requireString } from "./validation/primitives";

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

  validateProjectOverview(flow, errors);
  const domainIds = validateDomains(flow, errors);
  const roleIds = validateRoles(flow, domainIds, errors);
  const nodeIndex = validateNodes(flow, domainIds, roleIds, errors, warnings);
  const appSurfaceIds = validateAppSurfaces(flow, domainIds, roleIds, errors);
  const statusGroupIds = validateStatusGroups(flow, errors);
  validateNodeStatusGroups(flow, statusGroupIds, errors, warnings);
  validateEdges(flow, nodeIndex, appSurfaceIds, domainIds, roleIds, errors);

  const activeNodes = flow.nodes.filter((node) => isRecord(node) && node.status === "active");
  if (activeNodes.length === 0) {
    warnings.push("ProductFlow has no active nodes.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function isProductFlow(flow: unknown): flow is ProductFlow {
  return validateProductFlow(flow).valid;
}
