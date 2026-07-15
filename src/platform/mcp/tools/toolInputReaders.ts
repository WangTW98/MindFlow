import { APP_SURFACE_TYPES, EDGE_TYPES, ENTITY_STATUSES, FLOW_ENDPOINT_KINDS, type EdgeType, type EntityStatus, type FeatureGroup, type FlowEdge, type FlowEndpoint, type PageNode, type ProductFlow } from "../../../product-flow/domain";
import { PROJECT_OVERVIEW_NODE_ID, type FlowOperation, type FlowOperationResult, type TaxonomyKind, type UpdateEdgeDetailsInput, type UpdateNodeDetailsInput, type UpsertEdgeOperationInput } from "../../../product-flow/application/operations";
import { MINDFLOW_MCP_TOOLS } from "../protocol/toolSchemas";
import {
  asRecord,
  isRecord,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  readRecords,
  readStringArray,
  readStringPatch,
  requireString,
  requireStringEither,
  resolveId,
  stripUndefined
} from "./readers";
import { MCP_NODE_KINDS, type IdMaps, type McpNodeKind } from "./types";
import type { FlowSelectionPatch } from "../../../product-flow/domain/selection";

export function taxonomyUpsertOperation(input: Record<string, unknown>, kind: TaxonomyKind): FlowOperation {
  const item = asRecord(input.item ?? input);
  const id = readOptionalString(input, "id") ?? taxonomyItemId(kind, item);
  return { type: "taxonomy.upsert", kind, id, item };
}

export function nodeUpsertOperations(flow: ProductFlow, input: Record<string, unknown>, kind: McpNodeKind): FlowOperation[] {
  const nodeId = readOptionalString(input, "nodeId") ?? readOptionalString(input, "id");
  const existing = nodeId ? flow.nodes.find((node) => node.nodeId === nodeId) : undefined;
  const patch = readNodeDetailsPatch({ ...input, pageType: pageTypeForNodeKind(kind) });
  const x = readOptionalNumber(input, "x");
  const y = readOptionalNumber(input, "y");
  if (existing) {
    const operations: FlowOperation[] = [{ type: "node.update", nodeId: existing.nodeId, patch: stripUndefined(patch) }];
    if (x !== undefined && y !== undefined) {
      operations.push({ type: "node.move", nodeId: existing.nodeId, x, y });
    }
    return operations;
  }
  const detailPatch: UpdateNodeDetailsInput = stripUndefined({
    statusGroupId: patch.statusGroupId,
    permissions: patch.permissions,
    inputs: patch.inputs,
    outputs: patch.outputs,
    featureGroups: patch.featureGroups
  });
  return [{
    type: "node.create",
    input: {
      title: patch.title,
      pageType: patch.pageType,
      purpose: patch.purpose,
      x,
      y,
      appSurfaceIds: patch.appSurfaceIds,
      domainIds: patch.domainIds,
      roleIds: patch.roleIds,
      featureGroups: patch.featureGroups
    },
    detailPatch
  }];
}

export function readNodeDetailsPatch(input: Record<string, unknown>): UpdateNodeDetailsInput {
  return {
    title: readStringPatch(input, "title") ?? readStringPatch(input, "name"),
    pageType: readStringPatch(input, "pageType"),
    purpose: readStringPatch(input, "purpose") ?? readStringPatch(input, "description"),
    appSurfaceIds: readOptionalStringArray(input, "appSurfaceIds"),
    statusGroupId: readStringPatch(input, "statusGroupId"),
    domainIds: readOptionalStringArray(input, "domainIds"),
    roleIds: readOptionalStringArray(input, "roleIds"),
    permissions: readOptionalStringArray(input, "permissions"),
    inputs: readOptionalStringArray(input, "inputs"),
    outputs: readOptionalStringArray(input, "outputs"),
    featureGroups: Array.isArray(input.featureGroups) ? input.featureGroups as FeatureGroup[] : undefined
  };
}

export function readUpsertEdgeInput(input: Record<string, unknown>, flow: ProductFlow): UpsertEdgeOperationInput {
  const maps = createIdMaps(flow);
  const edgeId = readOptionalString(input, "edgeId") ?? readOptionalString(input, "id");
  const existing = edgeId ? flow.edges.find((edge) => edge.edgeId === edgeId) : undefined;
  return stripUndefined({
    edgeId,
    from: input.from === undefined && existing ? undefined : readEndpoint(input.from, maps),
    to: input.to === undefined && existing ? undefined : readEndpoint(input.to, maps),
    trigger: readStringPatch(input, "trigger") ?? readStringPatch(input, "action"),
    action: readStringPatch(input, "action"),
    type: readMcpEdgeType(input, existing?.type),
    condition: readStringPatch(input, "condition")
  });
}

export function readSelectionPatch(input: Record<string, unknown>): FlowSelectionPatch {
  return {
    selectedProjectOverview: readOptionalBoolean(input, "selectedProjectOverview"),
    selectedNodeId: readStringPatch(input, "selectedNodeId"),
    selectedNodeIds: readOptionalStringArray(input, "selectedNodeIds"),
    selectedEdgeId: readStringPatch(input, "selectedEdgeId"),
    selectedAppSurfaceId: readStringPatch(input, "selectedAppSurfaceId"),
    selectedDomainId: readStringPatch(input, "selectedDomainId"),
    selectedRoleId: readStringPatch(input, "selectedRoleId"),
    selectedStatusGroupId: readStringPatch(input, "selectedStatusGroupId")
  };
}

export function schemaPayload(): Record<string, unknown> {
  return {
    entityStatuses: [...ENTITY_STATUSES],
    appSurfaceTypes: [...APP_SURFACE_TYPES],
    edgeTypes: [...EDGE_TYPES],
    runtimeEdgeTypes: [...EDGE_TYPES],
    endpointKinds: [...FLOW_ENDPOINT_KINDS, "root"],
    nodeKinds: [...MCP_NODE_KINDS],
    nodePageTypes: MCP_NODE_KINDS.map(pageTypeForNodeKind)
  };
}

export function capabilitiesPayload(): Record<string, unknown> {
  return {
    tools: MINDFLOW_MCP_TOOLS.map((tool) => tool.name),
    writesDirectFiles: false,
    requiresUserSave: true,
    supportsSelection: true,
    supportsBatchNodeOperations: true,
    supportsDryRun: true
  };
}

export function readNodeKind(input: Record<string, unknown>): McpNodeKind {
  const kind = readOptionalString(input, "kind");
  if (kind && isMcpNodeKind(kind)) {
    return kind;
  }
  throw new Error("Node batch item kind must be layout, navigation, page, popup, or component.");
}

export function readStatuses(input: Record<string, unknown>): EntityStatus[] | undefined {
  const raw = input.statuses ?? input.status;
  const values = typeof raw === "string" ? [raw] : readStringArray(raw);
  const statuses = values.filter((value): value is EntityStatus => (ENTITY_STATUSES as readonly string[]).includes(value));
  return statuses.length > 0 ? statuses : undefined;
}

export function nodeMatchesFilters(
  node: PageNode,
  filters: {
    nodeIds?: string[];
    pageTypes?: string[];
    appSurfaceIds?: string[];
    domainIds?: string[];
    roleIds?: string[];
    statuses?: EntityStatus[];
    selection: boolean;
  },
  selectedNodeIds: string[]
): boolean {
  return matchesOptional(node.nodeId, filters.nodeIds) &&
    matchesOptional(node.pageType, filters.pageTypes) &&
    intersectsOptional(node.appSurfaceIds ?? [], filters.appSurfaceIds) &&
    intersectsOptional(node.domainIds, filters.domainIds) &&
    intersectsOptional(node.roleIds, filters.roleIds) &&
    matchesOptional(node.status, filters.statuses) &&
    (!filters.selection || selectedNodeIds.includes(node.nodeId));
}

export function edgeTouchesAnyNode(edge: FlowEdge, nodeIds: Set<string>): boolean {
  const from = edgeEndpoint(edge, "from");
  const to = edgeEndpoint(edge, "to");
  return endpointReferencesAnyNode(from, nodeIds) || endpointReferencesAnyNode(to, nodeIds);
}

export function readBatchItems(input: Record<string, unknown>): Record<string, unknown>[] {
  const items = readRecords(input.nodes ?? input.items);
  if (items.length === 0) {
    throw new Error("Batch node operation requires non-empty nodes or items array.");
  }
  return items;
}

export function readRequiredPosition(input: Record<string, unknown>): { x: number; y: number } {
  const x = readOptionalNumber(input, "x");
  const y = readOptionalNumber(input, "y");
  if (x === undefined || y === undefined) {
    throw new Error("Position requires finite x and y numbers.");
  }
  return { x, y };
}

export function requiredResult(result: FlowOperationResult | undefined): FlowOperationResult {
  if (!result) {
    throw new Error("MindFlow operation produced no result.");
  }
  return result;
}

function readEndpoint(value: unknown, maps: IdMaps): FlowEndpoint | undefined {
  if (typeof value === "string") {
    return { kind: "node", nodeId: resolveId(value, maps.nodes) };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = readOptionalString(value, "kind") ?? "node";
  if (kind === "root" || kind === "projectOverview") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
  if (kind === "appSurface") {
    const appId = resolveId(requireStringEither(value, ["appId", "nodeId", "id"]), maps.appSurfaces);
    return { kind: "appSurface", nodeId: appId, appId };
  }
  const nodeId = resolveId(requireStringEither(value, ["nodeId", "id"]), maps.nodes);
  if (kind === "featureGroup") {
    return { kind: "featureGroup", nodeId, groupId: requireString(value, "groupId") };
  }
  if (kind === "featureItem") {
    return { kind: "featureItem", nodeId, groupId: requireString(value, "groupId"), itemId: requireString(value, "itemId") };
  }
  if (kind === "node") {
    return { kind: "node", nodeId };
  }
  throw new Error(`Unsupported endpoint kind: ${kind}.`);
}

function readMcpEdgeType(input: Record<string, unknown>, fallback?: EdgeType): EdgeType {
  const explicit = readOptionalString(input, "type") ?? readOptionalString(input, "edgeType");
  if (explicit) {
    if (isEdgeTypeValue(explicit)) {
      return explicit;
    }
    throw new Error(`Unsupported MCP edge type: ${explicit}. Use one of ${EDGE_TYPES.join(", ")}.`);
  }
  return fallback ?? "interaction";
}

function createIdMaps(flow: ProductFlow): IdMaps {
  return {
    nodes: new Map(flow.nodes.map((node) => [node.nodeId, node.nodeId])),
    appSurfaces: new Map((flow.appSurfaces ?? []).map((surface) => [surface.appId, surface.appId]))
  };
}

function taxonomyItemId(kind: TaxonomyKind, item: Record<string, unknown>): string | undefined {
  if (kind === "domain") {
    return readOptionalString(item, "domainId");
  }
  if (kind === "role") {
    return readOptionalString(item, "roleId");
  }
  if (kind === "appSurface") {
    return readOptionalString(item, "appId");
  }
  return readOptionalString(item, "statusGroupId");
}

function pageTypeForNodeKind(kind: McpNodeKind): string {
  return kind === "layout" ? "skeleton" : kind;
}

function isMcpNodeKind(value: string): value is McpNodeKind {
  return (MCP_NODE_KINDS as readonly string[]).includes(value);
}

function matchesOptional(value: string, filters: readonly string[] | undefined): boolean {
  return !filters || filters.length === 0 || filters.includes(value);
}

function intersectsOptional(values: readonly string[], filters: readonly string[] | undefined): boolean {
  return !filters || filters.length === 0 || values.some((value) => filters.includes(value));
}

function endpointReferencesAnyNode(endpoint: FlowEndpoint, nodeIds: Set<string>): boolean {
  return endpoint.kind !== "appSurface" && endpoint.kind !== "projectOverview" && nodeIds.has(endpoint.nodeId);
}

function edgeEndpoint(edge: FlowEdge, side: "from" | "to"): FlowEndpoint {
  return side === "from" ? edge.from : edge.to;
}

function isEdgeTypeValue(value: string): value is EdgeType {
  return (EDGE_TYPES as readonly string[]).includes(value);
}
