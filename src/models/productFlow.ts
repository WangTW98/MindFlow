export type EntityStatus = "active" | "deprecated" | "removed";
export type EdgeType =
  | "interaction"
  | "autoNavigate"
  | "dataFlow"
  | "statusChange"
  | "navigate"
  | "submit"
  | "approve"
  | "reject"
  | "create"
  | "update"
  | "delete"
  | "system"
  | "branch";

export interface SourceRef {
  sourceId: string;
  label: string;
  excerpt?: string;
  location?: string;
}

export interface BusinessDomain {
  domainId: string;
  name: string;
  description: string;
}

export interface UserRole {
  roleId: string;
  name: string;
  description: string;
  domainIds: string[];
}

export interface AppSurface {
  appId: string;
  name: string;
  type: "admin" | "web" | "app" | "miniapp" | "desktop" | "other";
  description: string;
  domainIds: string[];
  roleIds: string[];
  view?: {
    position?: {
      x: number;
      y: number;
    };
  };
}

export interface ProductStatusGroup {
  statusGroupId: string;
  title: string;
  color: string;
}

export interface PageElement {
  elementId: string;
  name: string;
  type: string;
  description: string;
  dataBinding?: string;
  required?: boolean;
}

export interface PageAction {
  actionId: string;
  label: string;
  type: string;
  targetNodeId?: string;
  preconditions?: string[];
  result?: string;
}

export interface FeatureItem {
  itemId: string;
  name: string;
  type: string;
  description: string;
  dataBinding?: string;
  required?: boolean;
}

export interface FeatureGroup {
  groupId: string;
  name: string;
  type: string;
  description: string;
  items: FeatureItem[];
  actions?: PageAction[];
}

export interface PageState {
  stateId: string;
  name: string;
  description: string;
}

export interface PageException {
  exceptionId: string;
  name: string;
  handling: string;
}

export interface PageNode {
  nodeId: string;
  stableKey: string;
  status: EntityStatus;
  version: number;
  title: string;
  pageType: string;
  appSurfaceIds?: string[];
  statusGroupId?: string;
  domainIds: string[];
  roleIds: string[];
  purpose: string;
  featureGroups?: FeatureGroup[];
  elements: PageElement[];
  actions: PageAction[];
  states: PageState[];
  exceptions: PageException[];
  inputs: string[];
  outputs: string[];
  permissions: string[];
  sourceRefs: SourceRef[];
  artifacts: {
    prdIds: string[];
    pencilIds: string[];
  };
  createdByChangeSetId?: string;
  updatedByChangeSetId?: string;
  removedByChangeSetId?: string;
  replacementNodeIds?: string[];
  removedAt?: string;
  view?: {
    position?: {
      x: number;
      y: number;
    };
  };
  confidence: number;
}

export type FlowEndpointKind = "appSurface" | "node" | "featureGroup" | "featureItem";

export interface FlowEndpoint {
  kind: FlowEndpointKind;
  nodeId: string;
  appId?: string;
  groupId?: string;
  itemId?: string;
}

export interface FlowEdge {
  edgeId: string;
  status: EntityStatus;
  fromNodeId: string;
  toNodeId: string;
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  action: string;
  trigger?: string;
  type: EdgeType;
  condition?: string;
  appSurfaceIds?: string[];
  domainIds: string[];
  roleIds: string[];
  sourceRefs: SourceRef[];
  createdByChangeSetId?: string;
  updatedByChangeSetId?: string;
  removedByChangeSetId?: string;
  removedAt?: string;
  confidence: number;
}

export interface PrdRef {
  prdId: string;
  scope: "node" | "full";
  nodeId?: string;
  path: string;
  status: "active" | "stale" | "archived";
  staleReason?: string;
  staleByChangeSetId?: string;
  refreshedByChangeSetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PencilRef {
  pencilId: string;
  scope: "node" | "full";
  nodeId?: string;
  path: string;
  status: "active" | "stale" | "archived";
  staleReason?: string;
  staleByChangeSetId?: string;
  refreshedByChangeSetId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncIssue {
  issueId: string;
  severity: "info" | "warning" | "error";
  message: string;
  artifactId?: string;
  nodeId?: string;
  autoFixAvailable?: boolean;
}

export type ProductDesignIssueSeverity = "critical" | "warning" | "optional";

export interface ProductDesignIssue {
  issueId: string;
  severity: ProductDesignIssueSeverity;
  title: string;
  description: string;
  prompt: string;
  relatedNodeIds?: string[];
  relatedEdgeIds?: string[];
  sourceRefs?: SourceRef[];
}

export interface ChangeSetSummary {
  changeSetId: string;
  baseRevision: number;
  appliedRevision: number;
  instruction: string;
  intent: string;
  operationCount: number;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  appliedAt: string;
  revertedAt?: string;
  operations?: unknown[];
}

export interface ProductFlow {
  schemaVersion: string;
  flowId: string;
  revision: number;
  title: string;
  sourceDocumentId: string;
  sourceSummary: string;
  createdAt: string;
  updatedAt: string;
  domains: BusinessDomain[];
  roles: UserRole[];
  appSurfaces?: AppSurface[];
  statusGroups?: ProductStatusGroup[];
  nodes: PageNode[];
  edges: FlowEdge[];
  artifacts: {
    prds: PrdRef[];
    pencils: PencilRef[];
  };
  changeHistory: ChangeSetSummary[];
  syncState: {
    lastSyncedAt?: string;
    issues: SyncIssue[];
  };
  productDesignIssues?: ProductDesignIssue[];
  openQuestions?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

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
  requireString(flow, "sourceDocumentId", errors);
  requireString(flow, "sourceSummary", errors);
  requireString(flow, "createdAt", errors);
  requireString(flow, "updatedAt", errors);
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
  requireObject(flow, "artifacts", errors);
  requireArray(flow, "changeHistory", errors);
  requireObject(flow, "syncState", errors);
  if ("productDesignIssues" in flow) {
    requireArray(flow, "productDesignIssues", errors);
  }

  if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
    return { valid: errors.length === 0, errors, warnings };
  }

  const nodeIds = new Set<string>();
  for (const [index, node] of flow.nodes.entries()) {
    if (!isRecord(node)) {
      errors.push(`nodes[${index}] must be an object.`);
      continue;
    }
    requireString(node, "nodeId", errors, `nodes[${index}]`);
    requireString(node, "stableKey", errors, `nodes[${index}]`);
    requireString(node, "status", errors, `nodes[${index}]`);
    requireNumber(node, "version", errors, `nodes[${index}]`);
    requireString(node, "title", errors, `nodes[${index}]`);
    requireString(node, "pageType", errors, `nodes[${index}]`);
    if ("appSurfaceIds" in node) {
      requireArray(node, "appSurfaceIds", errors, `nodes[${index}]`);
    }
    requireArray(node, "domainIds", errors, `nodes[${index}]`);
    requireArray(node, "roleIds", errors, `nodes[${index}]`);
    requireString(node, "purpose", errors, `nodes[${index}]`);
    if ("featureGroups" in node) {
      requireArray(node, "featureGroups", errors, `nodes[${index}]`);
    }
    requireArray(node, "elements", errors, `nodes[${index}]`);
    requireArray(node, "actions", errors, `nodes[${index}]`);
    requireArray(node, "states", errors, `nodes[${index}]`);
    requireArray(node, "exceptions", errors, `nodes[${index}]`);
    requireArray(node, "inputs", errors, `nodes[${index}]`);
    requireArray(node, "outputs", errors, `nodes[${index}]`);
    requireArray(node, "permissions", errors, `nodes[${index}]`);
    requireArray(node, "sourceRefs", errors, `nodes[${index}]`);
    requireObject(node, "artifacts", errors, `nodes[${index}]`);
    requireNumber(node, "confidence", errors, `nodes[${index}]`);
    if (typeof node.nodeId === "string") {
      if (nodeIds.has(node.nodeId)) {
        errors.push(`Duplicate nodeId: ${node.nodeId}`);
      }
      nodeIds.add(node.nodeId);
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
      requireString(surface, "description", errors, `appSurfaces[${index}]`);
      requireArray(surface, "domainIds", errors, `appSurfaces[${index}]`);
      requireArray(surface, "roleIds", errors, `appSurfaces[${index}]`);
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
      requireString(group, "color", errors, `statusGroups[${index}]`);
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
    requireString(edge, "fromNodeId", errors, `edges[${index}]`);
    requireString(edge, "toNodeId", errors, `edges[${index}]`);
    requireString(edge, "action", errors, `edges[${index}]`);
    requireString(edge, "type", errors, `edges[${index}]`);
    if ("appSurfaceIds" in edge) {
      requireArray(edge, "appSurfaceIds", errors, `edges[${index}]`);
    }
    requireArray(edge, "domainIds", errors, `edges[${index}]`);
    requireArray(edge, "roleIds", errors, `edges[${index}]`);
    requireArray(edge, "sourceRefs", errors, `edges[${index}]`);
    requireNumber(edge, "confidence", errors, `edges[${index}]`);
    if (typeof edge.edgeId === "string") {
      if (edgeIds.has(edge.edgeId)) {
        errors.push(`Duplicate edgeId: ${edge.edgeId}`);
      }
      edgeIds.add(edge.edgeId);
    }
    if (typeof edge.fromNodeId === "string" && !isAppSurfaceEndpoint(edge.from, edge.fromNodeId) && !nodeIds.has(edge.fromNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing fromNodeId ${edge.fromNodeId}`);
    }
    if (typeof edge.toNodeId === "string" && !isAppSurfaceEndpoint(edge.to, edge.toNodeId) && !nodeIds.has(edge.toNodeId)) {
      errors.push(`Edge ${edge.edgeId ?? index} references missing toNodeId ${edge.toNodeId}`);
    }
    checkEndpoint(edge.from, `edges[${index}].from`, nodeIds, appSurfaceIds, errors);
    checkEndpoint(edge.to, `edges[${index}].to`, nodeIds, appSurfaceIds, errors);
  }

  validateProductDesignIssues(flow.productDesignIssues, nodeIds, edgeIds, errors, warnings);

  const artifactIds = new Set<string>();
  const artifacts = flow.artifacts;
  if (isRecord(artifacts)) {
    checkArtifactIds(artifacts.prds, "prdId", artifactIds, errors);
    checkArtifactIds(artifacts.pencils, "pencilId", artifactIds, errors);
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

function validateProductDesignIssues(
  value: unknown,
  nodeIds: Set<string>,
  edgeIds: Set<string>,
  errors: string[],
  warnings: string[]
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    return;
  }
  const issueIds = new Set<string>();
  const severities = new Set<ProductDesignIssueSeverity>(["critical", "warning", "optional"]);
  for (const [index, issue] of value.entries()) {
    const path = `productDesignIssues[${index}]`;
    if (!isRecord(issue)) {
      errors.push(`${path} must be an object.`);
      continue;
    }
    requireString(issue, "issueId", errors, path);
    requireString(issue, "severity", errors, path);
    requireString(issue, "title", errors, path);
    requireString(issue, "description", errors, path);
    requireString(issue, "prompt", errors, path);

    if (typeof issue.issueId === "string") {
      if (issueIds.has(issue.issueId)) {
        errors.push(`Duplicate productDesignIssue issueId: ${issue.issueId}`);
      }
      issueIds.add(issue.issueId);
    }
    if (typeof issue.severity === "string" && !severities.has(issue.severity as ProductDesignIssueSeverity)) {
      errors.push(`${path}.severity must be critical, warning, or optional.`);
    }
    checkOptionalStringReferences(issue.relatedNodeIds, `${path}.relatedNodeIds`, nodeIds, "node", errors, warnings);
    checkOptionalStringReferences(issue.relatedEdgeIds, `${path}.relatedEdgeIds`, edgeIds, "edge", errors, warnings);
    if ("sourceRefs" in issue) {
      requireArray(issue, "sourceRefs", errors, path);
    }
  }
}

function checkOptionalStringReferences(
  value: unknown,
  path: string,
  knownIds: Set<string>,
  label: "node" | "edge",
  errors: string[],
  warnings: string[]
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      errors.push(`${path}[${index}] must be a string.`);
      continue;
    }
    if (!knownIds.has(item)) {
      warnings.push(`${path}[${index}] references missing ${label} ${item}.`);
    }
  }
}

function checkArtifactIds(
  value: unknown,
  idField: "prdId" | "pencilId",
  artifactIds: Set<string>,
  errors: string[]
): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const [index, artifact] of value.entries()) {
    if (!isRecord(artifact)) {
      errors.push(`artifacts.${idField === "prdId" ? "prds" : "pencils"}[${index}] must be an object.`);
      continue;
    }
    const id = artifact[idField];
    if (typeof id !== "string") {
      errors.push(`Artifact at index ${index} is missing ${idField}.`);
      continue;
    }
    if (artifactIds.has(id)) {
      errors.push(`Duplicate artifact id: ${id}`);
    }
    artifactIds.add(id);
  }
}

function checkEndpoint(
  value: unknown,
  path: string,
  nodeIds: Set<string>,
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
  if (value.kind !== "node" && value.kind !== "featureGroup" && value.kind !== "featureItem") {
    errors.push(`${path}.kind must be appSurface, node, featureGroup, or featureItem.`);
  }
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
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a number.`);
  }
}

function requireArray(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!Array.isArray(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an array.`);
  }
}

function requireObject(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!isRecord(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an object.`);
  }
}
