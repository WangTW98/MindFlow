import {
  createFlowEdge,
  createFlowNode,
  removeFlowEdge,
  removeFlowNode,
  updateFlowAppSurfacePosition,
  updateFlowEdgeDetails,
  updateFlowNodeDetails,
  updateFlowNodePosition,
  type CreateEdgeInput,
  type CreateNodeInput,
  type RemoveNodeResult,
  type UpdateEdgeDetailsInput,
  type UpdateNodeDetailsInput
} from "../flowEditing";
import { PROJECT_OVERVIEW_NODE_ID, updateProjectOverview, updateProjectOverviewPosition, type UpdateProjectOverviewInput } from "../projectOverview";
import { applyTaxonomyRequest, type TaxonomyKind, type TaxonomyRequest } from "../taxonomy";
import type { FlowSelectionPatch } from "../editorSelection";
import type { AppSurface, FlowEdge, FlowEndpoint, PageNode, ProductFlow } from "../../models/productFlow";

export type { CreateEdgeInput, CreateNodeInput, UpdateEdgeDetailsInput, UpdateNodeDetailsInput } from "../flowEditing";

export type FlowOperation =
  | { type: "project.update"; patch: UpdateProjectOverviewInput }
  | { type: "project.move"; x: number; y: number }
  | { type: "taxonomy.upsert"; kind: TaxonomyKind; id?: string; item?: Record<string, unknown> }
  | { type: "taxonomy.remove"; kind: TaxonomyKind; id: string }
  | { type: "appSurface.move"; appId: string; x: number; y: number }
  | { type: "node.create"; input?: CreateNodeInput; detailPatch?: UpdateNodeDetailsInput }
  | { type: "node.update"; nodeId: string; patch: UpdateNodeDetailsInput }
  | { type: "node.move"; nodeId: string; x: number; y: number }
  | { type: "node.remove"; nodeId: string }
  | { type: "node.createConnected"; request: CreateConnectedNodeOperationInput }
  | { type: "edge.upsert"; input: UpsertEdgeOperationInput }
  | { type: "edge.update"; edgeId: string; patch: UpdateEdgeDetailsInput }
  | { type: "edge.remove"; edgeId: string };

export interface CreateConnectedNodeOperationInput {
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  x?: number;
  y?: number;
  trigger?: string;
  type?: CreateEdgeInput["type"];
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
}

export interface UpsertEdgeOperationInput extends UpdateEdgeDetailsInput {
  edgeId?: string;
  id?: string;
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  trigger?: string;
  action?: string;
}

export type FlowOperationResult =
  | { type: "project.update"; root: Record<string, unknown>; selection: FlowSelectionPatch }
  | { type: "project.move"; root: Record<string, unknown> }
  | { type: "taxonomy.upsert"; taxonomy: { kind: TaxonomyKind; id: string; item: unknown }; selection: FlowSelectionPatch }
  | { type: "taxonomy.remove"; taxonomy: { kind: TaxonomyKind; id: string; item: null }; removedId: string; selection: FlowSelectionPatch }
  | { type: "appSurface.move"; appSurface: AppSurface }
  | { type: "node.create"; node: PageNode; selection: FlowSelectionPatch }
  | { type: "node.update"; node: PageNode; selection: FlowSelectionPatch }
  | { type: "node.move"; node: PageNode }
  | { type: "node.remove"; removedNodeId: string; removedEdgeIds: string[]; result: RemoveNodeResult; selection: FlowSelectionPatch }
  | { type: "node.createConnected"; node: PageNode; edge?: FlowEdge; selection: FlowSelectionPatch }
  | { type: "edge.upsert"; edge: FlowEdge; mode: "created" | "updated" | "updatedExisting"; selection: FlowSelectionPatch }
  | { type: "edge.update"; edge: FlowEdge; selection: FlowSelectionPatch }
  | { type: "edge.remove"; removedEdgeId: string; edge: FlowEdge; selection: FlowSelectionPatch };

export interface ApplyFlowOperationsOptions {
  atomic?: boolean;
  dryRun?: boolean;
}

export interface ApplyFlowOperationsResult {
  flow: ProductFlow;
  results: FlowOperationResult[];
  applied: boolean;
  dryRun: boolean;
  selection?: FlowSelectionPatch;
}

export function applyFlowOperation(flow: ProductFlow, operation: FlowOperation): FlowOperationResult {
  switch (operation.type) {
    case "project.update": {
      updateProjectOverview(flow, operation.patch);
      return {
        type: operation.type,
        root: rootPayload(flow),
        selection: { selectedProjectOverview: true }
      };
    }
    case "project.move": {
      updateProjectOverviewPosition(flow, operation.x, operation.y);
      return { type: operation.type, root: rootPayload(flow) };
    }
    case "taxonomy.upsert": {
      const taxonomy = upsertTaxonomyInFlow(flow, operation.kind, operation.id, operation.item);
      return {
        type: operation.type,
        taxonomy,
        selection: taxonomySelectionPatch(operation.kind, taxonomy.id)
      };
    }
    case "taxonomy.remove": {
      applyTaxonomyRequest(flow, { kind: operation.kind, action: "delete", id: operation.id });
      return {
        type: operation.type,
        taxonomy: { kind: operation.kind, id: operation.id, item: null },
        removedId: operation.id,
        selection: taxonomySelectionPatch(operation.kind, undefined)
      };
    }
    case "appSurface.move": {
      return {
        type: operation.type,
        appSurface: updateFlowAppSurfacePosition(flow, operation.appId, operation.x, operation.y)
      };
    }
    case "node.create": {
      const node = createFlowNode(flow, operation.input);
      if (operation.detailPatch && Object.keys(operation.detailPatch).length > 0) {
        updateFlowNodeDetails(flow, node.nodeId, operation.detailPatch);
      }
      return {
        type: operation.type,
        node,
        selection: nodeSelectionPatch(node.nodeId)
      };
    }
    case "node.update": {
      const node = updateFlowNodeDetails(flow, operation.nodeId, operation.patch);
      return {
        type: operation.type,
        node,
        selection: nodeSelectionPatch(node.nodeId)
      };
    }
    case "node.move": {
      return {
        type: operation.type,
        node: updateFlowNodePosition(flow, operation.nodeId, operation.x, operation.y)
      };
    }
    case "node.remove": {
      const result = removeFlowNode(flow, operation.nodeId);
      return {
        type: operation.type,
        removedNodeId: result.node.nodeId,
        removedEdgeIds: result.removedEdges.map((edge) => edge.edgeId),
        result,
        selection: { selectedProjectOverview: false }
      };
    }
    case "node.createConnected": {
      const { node, edge } = createConnectedNode(flow, operation.request);
      return {
        type: operation.type,
        node,
        edge,
        selection: nodeSelectionPatch(node.nodeId)
      };
    }
    case "edge.upsert": {
      const result = upsertEdgeInFlow(flow, operation.input);
      return {
        type: operation.type,
        ...result,
        selection: { selectedProjectOverview: false, selectedEdgeId: result.edge.edgeId }
      };
    }
    case "edge.update": {
      const edge = updateFlowEdgeDetails(flow, operation.edgeId, operation.patch);
      return {
        type: operation.type,
        edge,
        selection: { selectedProjectOverview: false, selectedEdgeId: edge.edgeId }
      };
    }
    case "edge.remove": {
      const edge = removeFlowEdge(flow, operation.edgeId);
      return {
        type: operation.type,
        removedEdgeId: edge.edgeId,
        edge,
        selection: { selectedProjectOverview: false }
      };
    }
  }
}

export function applyFlowOperations(
  flow: ProductFlow,
  operations: readonly FlowOperation[],
  options: ApplyFlowOperationsOptions = {}
): ApplyFlowOperationsResult {
  const dryRun = options.dryRun === true;
  const target = options.atomic || dryRun ? cloneProductFlow(flow) : flow;
  const results = operations.map((operation) => applyFlowOperation(target, operation));
  return {
    flow: target,
    results,
    applied: !dryRun,
    dryRun,
    selection: combineSelection(results)
  };
}

export function cloneProductFlow(flow: ProductFlow): ProductFlow {
  return JSON.parse(JSON.stringify(flow)) as ProductFlow;
}

export function taxonomySelectionPatch(kind: TaxonomyKind, id: string | undefined): FlowSelectionPatch {
  const base = { selectedProjectOverview: false };
  if (kind === "appSurface") {
    return { ...base, selectedAppSurfaceId: id };
  }
  if (kind === "domain") {
    return { ...base, selectedDomainId: id };
  }
  if (kind === "role") {
    return { ...base, selectedRoleId: id };
  }
  return { ...base, selectedStatusGroupId: id };
}

function upsertTaxonomyInFlow(flow: ProductFlow, kind: TaxonomyKind, id: string | undefined, item: Record<string, unknown> = {}): { kind: TaxonomyKind; id: string; item: unknown } {
  const resolvedId = id ?? taxonomyItemId(kind, item);
  const request: TaxonomyRequest = { kind, action: resolvedId ? "update" : "create", id: resolvedId, item };
  applyTaxonomyRequest(flow, request);
  const resolved = findTaxonomyItem(flow, kind, resolvedId, readOptionalString(item, "name") ?? readOptionalString(item, "title"));
  if (!resolved) {
    throw new Error(`Unable to resolve taxonomy item after upsert: ${kind}`);
  }
  return { kind, id: resolved.id, item: resolved.item };
}

function createConnectedNode(flow: ProductFlow, request: CreateConnectedNodeOperationInput): { node: PageNode; edge?: FlowEdge } {
  if (!request.from && !request.to) {
    throw new Error("Connected node creation requires from or to endpoint.");
  }
  const relatedNode = request.from
    ? request.from.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.from?.nodeId)
    : request.to?.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.to?.nodeId);
  const relatedAppSurfaceIds = request.from?.kind === "appSurface"
    ? [request.from.appId ?? request.from.nodeId]
    : request.to?.kind === "appSurface"
      ? [request.to.appId ?? request.to.nodeId]
      : relatedNode?.appSurfaceIds;
  const node = createFlowNode(flow, {
    x: request.x,
    y: request.y,
    appSurfaceIds: nonEmptyArrayOr(request.appSurfaceIds, relatedAppSurfaceIds),
    domainIds: nonEmptyArrayOr(request.domainIds, relatedNode?.domainIds),
    roleIds: nonEmptyArrayOr(request.roleIds, relatedNode?.roleIds)
  });
  if (request.from) {
    return {
      node,
      edge: createFlowEdge(flow, {
        from: request.from,
        to: { kind: "node", nodeId: node.nodeId },
        trigger: request.trigger,
        type: request.type
      })
    };
  }
  if (request.to) {
    return {
      node,
      edge: createFlowEdge(flow, {
        from: { kind: "node", nodeId: node.nodeId },
        to: request.to,
        trigger: request.trigger,
        type: request.type
      })
    };
  }
  return { node };
}

function upsertEdgeInFlow(flow: ProductFlow, input: UpsertEdgeOperationInput): { edge: FlowEdge; mode: "created" | "updated" | "updatedExisting" } {
  const edgeId = input.edgeId ?? input.id;
  const existing = edgeId ? flow.edges.find((edge) => edge.edgeId === edgeId) : undefined;
  const from = input.from ?? (existing ? edgeEndpoint(existing, "from") : undefined);
  const to = input.to ?? (existing ? edgeEndpoint(existing, "to") : undefined);
  if (!from || !to) {
    throw new Error("Edge requires both from and to endpoints.");
  }
  const type = input.type ?? existing?.type ?? "interaction";
  const conflict = findSameEndpointEdge(flow, from, to, edgeId);
  const patch: UpdateEdgeDetailsInput = stripUndefined({
    from,
    to,
    trigger: input.trigger ?? input.action,
    action: input.action,
    type,
    condition: input.condition,
    appSurfaceIds: input.appSurfaceIds,
    domainIds: input.domainIds,
    roleIds: input.roleIds
  });
  if (conflict) {
    if (conflict.type !== type) {
      throw new Error(`Refusing duplicate endpoints with different edge type. Existing edge ${conflict.edgeId} uses ${conflict.type}.`);
    }
    return { edge: updateFlowEdgeDetails(flow, conflict.edgeId, patch), mode: "updatedExisting" };
  }
  if (existing) {
    return { edge: updateFlowEdgeDetails(flow, existing.edgeId, patch), mode: "updated" };
  }
  const edge = createFlowEdge(flow, {
    from,
    to,
    trigger: patch.trigger,
    type,
    condition: patch.condition
  });
  const detailPatch: UpdateEdgeDetailsInput = stripUndefined({
    condition: patch.condition,
    appSurfaceIds: patch.appSurfaceIds,
    domainIds: patch.domainIds,
    roleIds: patch.roleIds
  });
  if (Object.keys(detailPatch).length > 0) {
    updateFlowEdgeDetails(flow, edge.edgeId, detailPatch);
  }
  return { edge, mode: "created" };
}

function findTaxonomyItem(flow: ProductFlow, kind: TaxonomyKind, id: string | undefined, name: string | undefined): { id: string; item: unknown } | undefined {
  if (kind === "domain") {
    const item = id ? flow.domains.find((candidate) => candidate.domainId === id) : flow.domains.find((candidate) => candidate.name === name);
    return item ? { id: item.domainId, item } : undefined;
  }
  if (kind === "role") {
    const item = id ? flow.roles.find((candidate) => candidate.roleId === id) : flow.roles.find((candidate) => candidate.name === name);
    return item ? { id: item.roleId, item } : undefined;
  }
  if (kind === "appSurface") {
    const item = id ? flow.appSurfaces?.find((candidate) => candidate.appId === id) : flow.appSurfaces?.find((candidate) => candidate.name === name);
    return item ? { id: item.appId, item } : undefined;
  }
  const item = id ? flow.statusGroups?.find((candidate) => candidate.statusGroupId === id) : flow.statusGroups?.find((candidate) => candidate.title === name);
  return item ? { id: item.statusGroupId, item } : undefined;
}

function findSameEndpointEdge(flow: ProductFlow, from: FlowEndpoint, to: FlowEndpoint, exceptEdgeId?: string): FlowEdge | undefined {
  return flow.edges.find((edge) =>
    edge.status === "active" &&
    edge.edgeId !== exceptEdgeId &&
    endpointKey(edgeEndpoint(edge, "from")) === endpointKey(from) &&
    endpointKey(edgeEndpoint(edge, "to")) === endpointKey(to)
  );
}

function edgeEndpoint(edge: FlowEdge, side: "from" | "to"): FlowEndpoint {
  const endpoint = side === "from" ? edge.from : edge.to;
  return endpoint ?? { kind: "node", nodeId: side === "from" ? edge.fromNodeId : edge.toNodeId };
}

function endpointKey(endpoint: FlowEndpoint): string {
  return [endpoint.kind, endpoint.nodeId, endpoint.appId ?? "", endpoint.groupId ?? "", endpoint.itemId ?? ""].join("|");
}

function combineSelection(results: readonly FlowOperationResult[]): FlowSelectionPatch | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    const selection = result && "selection" in result ? result.selection : undefined;
    if (selection) {
      return selection;
    }
  }
  return undefined;
}

function nodeSelectionPatch(nodeId: string): FlowSelectionPatch {
  return { selectedProjectOverview: false, selectedNodeId: nodeId, selectedNodeIds: [nodeId] };
}

function rootPayload(flow: ProductFlow): Record<string, unknown> {
  return {
    nodeId: PROJECT_OVERVIEW_NODE_ID,
    title: flow.title,
    projectOverview: flow.projectOverview
  };
}

function nonEmptyArrayOr(value: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
