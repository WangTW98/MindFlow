import { emptyFlowSelection, normalizeFlowSelection, type FlowSelectionPatch, type FlowSelectionState } from "../../domain/selection";
import {
  applyFlowOperation,
  applyFlowOperations,
  type FlowOperation,
  type FlowOperationResult,
  type UpdateEdgeDetailsInput,
  type UpdateNodeDetailsInput,
  type UpsertEdgeOperationInput
} from "../../domain/operations";
import { PROJECT_OVERVIEW_NODE_ID } from "../../domain/operations";
import type { TaxonomyKind } from "../../domain/operations";
import { APP_SURFACE_TYPES, EDGE_TYPES, ENTITY_STATUSES, FLOW_ENDPOINT_KINDS, type EdgeType, type EntityStatus, type FeatureGroup, type FlowEdge, type FlowEndpoint, type PageNode, type ProductFlow } from "../../domain/product-flow";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../bridge";
import { MINDFLOW_OPERATIONS_REFERENCE } from "../operationsReference";
import { MINDFLOW_MCP_TOOLS } from "../toolSchemas";
import {
  batchSelectionPatch,
  buildHydratedSelection,
  buildSelectionIssues,
  operationPayload,
  resultNodes,
  snapshotToPayload
} from "./payloads";
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
import { createMcpToolRegistry, type McpToolInvoker, type McpToolResult } from "./registry";

export const MCP_NODE_KINDS = ["layout", "navigation", "page", "popup", "component"] as const;
export type McpNodeKind = typeof MCP_NODE_KINDS[number];

interface IdMaps {
  nodes: Map<string, string>;
  appSurfaces: Map<string, string>;
}

interface BuiltMcpEdit {
  operations: FlowOperation[];
  atomic?: boolean;
  result?(results: FlowOperationResult[], flow: ProductFlow): McpToolResult;
  selection?(results: FlowOperationResult[]): FlowSelectionPatch | undefined;
}

interface BatchEditResult {
  [key: string]: unknown;
  editor: Record<string, unknown>;
  applied: boolean;
  dryRun: boolean;
  issues: string[];
  result?: McpToolResult;
  flow?: ProductFlow;
}

export class MindFlowMcpToolHandlers {
  private readonly toolRegistry: ReadonlyMap<string, McpToolInvoker>;

  public constructor(private readonly bridge: MindFlowEditorBridge) {
    this.toolRegistry = createMcpToolRegistry({
      getEditorState: (input) => this.getEditorState(input),
      getOpenEditors: () => this.getOpenEditors(),
      getSelection: (input) => this.getSelection(input),
      setSelection: (input) => this.setSelection(input),
      clearSelection: (input) => this.clearSelection(input),
      updateRoot: (input) => this.updateRoot(input),
      moveRoot: (input) => this.moveRoot(input),
      upsertAppSurface: (input) => this.upsertAppSurface(input),
      removeAppSurface: (input) => this.removeAppSurface(input),
      moveAppSurface: (input) => this.moveAppSurface(input),
      upsertDomain: (input) => this.upsertTaxonomy(input, "domain"),
      removeDomain: (input) => this.removeTaxonomy(input, "domain", ["domainId", "id"]),
      upsertRole: (input) => this.upsertTaxonomy(input, "role"),
      removeRole: (input) => this.removeTaxonomy(input, "role", ["roleId", "id"]),
      upsertStatusGroup: (input) => this.upsertTaxonomy(input, "statusGroup"),
      removeStatusGroup: (input) => this.removeTaxonomy(input, "statusGroup", ["statusGroupId", "id"]),
      upsertLayoutNode: (input) => this.upsertTypedNode(input, "layout"),
      upsertNavigationNode: (input) => this.upsertTypedNode(input, "navigation"),
      upsertPageNode: (input) => this.upsertTypedNode(input, "page"),
      upsertPopupNode: (input) => this.upsertTypedNode(input, "popup"),
      upsertComponentNode: (input) => this.upsertTypedNode(input, "component"),
      updateNode: (input) => this.updateNode(input),
      moveNode: (input) => this.moveNode(input),
      removeNode: (input) => this.removeNode(input),
      upsertEdge: (input) => this.upsertEdge(input),
      removeEdge: (input) => this.removeEdge(input),
      batchGetNodes: (input) => this.batchGetNodes(input),
      batchUpsertNodes: (input) => this.batchUpsertNodes(input),
      batchUpdateNodes: (input) => this.batchUpdateNodes(input),
      batchMoveNodes: (input) => this.batchMoveNodes(input),
      batchRemoveNodes: (input) => this.batchRemoveNodes(input)
    });
  }

  public listTools(): typeof MINDFLOW_MCP_TOOLS {
    return MINDFLOW_MCP_TOOLS;
  }

  public async callTool(name: string, args: unknown): Promise<McpToolResult> {
    const input = asRecord(args);
    const invoke = this.toolRegistry.get(name);
    if (!invoke) {
      throw new Error(`Unknown MindFlow MCP tool: ${name}`);
    }
    return invoke(input);
  }

  public readOperationsReference(): string {
    return MINDFLOW_OPERATIONS_REFERENCE;
  }

  private async getEditorState(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    return {
      editor: snapshotToPayload(snapshot),
      flow: snapshot.flow,
      selection: normalizeFlowSelection(snapshot.selection),
      hydratedSelection: buildHydratedSelection(snapshot),
      selectionIssues: buildSelectionIssues(snapshot),
      schema: schemaPayload(),
      capabilities: capabilitiesPayload()
    };
  }

  private async getOpenEditors(): Promise<McpToolResult> {
    const editors = await this.bridge.getOpenEditors();
    return { editors: editors.map(snapshotToPayload) };
  }

  private async getSelection(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    return {
      editor: snapshotToPayload(snapshot),
      selection: normalizeFlowSelection(snapshot.selection),
      hydratedSelection: buildHydratedSelection(snapshot),
      selectionIssues: buildSelectionIssues(snapshot)
    };
  }

  private async setSelection(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const next = await this.bridge.setSelection(snapshot.uri, readSelectionPatch(input));
    return {
      editor: snapshotToPayload(next),
      selection: normalizeFlowSelection(next.selection),
      hydratedSelection: buildHydratedSelection(next),
      selectionIssues: buildSelectionIssues(next)
    };
  }

  private async clearSelection(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const next = await this.bridge.setSelection(snapshot.uri, emptyFlowSelection());
    return {
      editor: snapshotToPayload(next),
      selection: normalizeFlowSelection(next.selection),
      hydratedSelection: buildHydratedSelection(next),
      selectionIssues: buildSelectionIssues(next)
    };
  }

  private async updateRoot(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [{
        type: "project.update",
        patch: {
          title: readOptionalString(input, "title"),
          summary: readOptionalString(input, "summary"),
          goal: readStringPatch(input, "goal")
        }
      }]
    }));
  }

  private async moveRoot(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [{ type: "project.move", ...readRequiredPosition(input) }]
    }));
  }

  private async upsertAppSurface(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [taxonomyUpsertOperation(input, "appSurface")]
    }));
  }

  private async removeAppSurface(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [{ type: "taxonomy.remove", kind: "appSurface", id: requireStringEither(input, ["appId", "id"]) }]
    }));
  }

  private async moveAppSurface(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => {
      const position = readRequiredPosition(input);
      return {
        operations: [{ type: "appSurface.move", appId: requireStringEither(input, ["appId", "id"]), x: position.x, y: position.y }]
      };
    });
  }

  private async upsertTaxonomy(input: Record<string, unknown>, kind: TaxonomyKind): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [taxonomyUpsertOperation(input, kind)]
    }));
  }

  private async removeTaxonomy(input: Record<string, unknown>, kind: TaxonomyKind, idKeys: string[]): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [{ type: "taxonomy.remove", kind, id: requireStringEither(input, idKeys) }]
    }));
  }

  private async upsertTypedNode(input: Record<string, unknown>, kind: McpNodeKind): Promise<McpToolResult> {
    return this.editFlow(input, (flow) => ({
      operations: nodeUpsertOperations(flow, input, kind),
      result: (results) => {
        const nodes = resultNodes(results);
        const node = nodes[nodes.length - 1];
        return { node, kind };
      }
    }));
  }

  private async updateNode(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [{ type: "node.update", nodeId: requireStringEither(input, ["nodeId", "id"]), patch: stripUndefined(readNodeDetailsPatch(input)) }]
    }));
  }

  private async moveNode(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => {
      const position = readRequiredPosition(input);
      return {
        operations: [{ type: "node.move", nodeId: requireStringEither(input, ["nodeId", "id"]), x: position.x, y: position.y }]
      };
    });
  }

  private async removeNode(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [{ type: "node.remove", nodeId: requireStringEither(input, ["nodeId", "id"]) }]
    }));
  }

  private async upsertEdge(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, (flow) => ({
      operations: [{ type: "edge.upsert", input: readUpsertEdgeInput(input, flow) }]
    }));
  }

  private async removeEdge(input: Record<string, unknown>): Promise<McpToolResult> {
    return this.editFlow(input, () => ({
      operations: [{ type: "edge.remove", edgeId: requireStringEither(input, ["edgeId", "id"]) }]
    }));
  }

  private async batchUpsertNodes(input: Record<string, unknown>): Promise<BatchEditResult> {
    return this.batchEditNodes(input, (flow, items) => ({
      operations: items.flatMap((item) => nodeUpsertOperations(flow, item, readNodeKind(item))),
      result: (results) => ({ nodes: resultNodes(results) }),
      selection: (results) => batchSelectionPatch(resultNodes(results), true)
    }));
  }

  private async batchUpdateNodes(input: Record<string, unknown>): Promise<BatchEditResult> {
    return this.batchEditNodes(input, (_flow, items) => ({
      operations: items.map((item) => ({ type: "node.update", nodeId: requireStringEither(item, ["nodeId", "id"]), patch: stripUndefined(readNodeDetailsPatch(item)) })),
      result: (results) => ({ nodes: resultNodes(results) }),
      selection: (results) => batchSelectionPatch(resultNodes(results), true)
    }));
  }

  private async batchMoveNodes(input: Record<string, unknown>): Promise<BatchEditResult> {
    return this.batchEditNodes(input, (_flow, items) => ({
      operations: items.map((item) => {
        const position = readRequiredPosition(item);
        return { type: "node.move", nodeId: requireStringEither(item, ["nodeId", "id"]), x: position.x, y: position.y };
      }),
      result: (results) => ({ nodes: resultNodes(results) }),
      selection: (results) => batchSelectionPatch(resultNodes(results), true)
    }));
  }

  private async batchRemoveNodes(input: Record<string, unknown>): Promise<BatchEditResult> {
    return this.batchEditNodes(input, (_flow, items) => ({
      operations: items.map((item) => ({ type: "node.remove", nodeId: requireStringEither(item, ["nodeId", "id"]) })),
      result: (results) => ({
        removedNodeIds: results.flatMap((result) => result.type === "node.remove" ? [result.removedNodeId] : []),
        removedEdgeIds: Array.from(new Set(results.flatMap((result) => result.type === "node.remove" ? result.removedEdgeIds : [])))
      })
    }));
  }

  private async editFlow(
    input: Record<string, unknown>,
    build: (flow: ProductFlow, snapshot: MindFlowEditorSnapshot) => BuiltMcpEdit
  ): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const expectedRevision = snapshot.flow.revision;
    const built = build(snapshot.flow, snapshot);
    const applied = applyFlowOperations(snapshot.flow, built.operations, { atomic: built.atomic });
    const result = built.result
      ? built.result(applied.results, applied.flow)
      : applied.results.length === 1
        ? operationPayload(requiredResult(applied.results[0]))
        : { results: applied.results.map(operationPayload) };
    const selection = built.selection?.(applied.results) ?? applied.selection;
    const next = await this.bridge.applyFlowEdit(snapshot.uri, applied.flow, selection, expectedRevision);
    return { editor: snapshotToPayload(next), result, flow: next.flow };
  }

  private async batchGetNodes(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const selectedNodeIds = normalizeFlowSelection(snapshot.selection).selectedNodeIds;
    const filters = {
      nodeIds: readOptionalStringArray(input, "nodeIds"),
      pageTypes: readOptionalStringArray(input, "pageTypes"),
      appSurfaceIds: readOptionalStringArray(input, "appSurfaceIds"),
      domainIds: readOptionalStringArray(input, "domainIds"),
      roleIds: readOptionalStringArray(input, "roleIds"),
      statuses: readStatuses(input),
      selection: readOptionalBoolean(input, "selection") === true,
      includeIncidentEdges: readOptionalBoolean(input, "includeIncidentEdges") === true
    };
    const nodes = snapshot.flow.nodes.filter((node) => nodeMatchesFilters(node, filters, selectedNodeIds));
    const nodeIds = new Set(nodes.map((node) => node.nodeId));
    return {
      editor: snapshotToPayload(snapshot),
      nodes,
      edges: filters.includeIncidentEdges ? snapshot.flow.edges.filter((edge) => edgeTouchesAnyNode(edge, nodeIds)) : undefined
    };
  }

  private async batchEditNodes(
    input: Record<string, unknown>,
    build: (flow: ProductFlow, items: Record<string, unknown>[]) => BuiltMcpEdit
  ): Promise<BatchEditResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const expectedRevision = snapshot.flow.revision;
    const dryRun = readOptionalBoolean(input, "dryRun") === true;
    const items = readBatchItems(input);
    try {
      const built = build(snapshot.flow, items);
      const applied = applyFlowOperations(snapshot.flow, built.operations, { atomic: true, dryRun });
      const result = built.result
        ? built.result(applied.results, applied.flow)
        : { results: applied.results.map(operationPayload) };
      if (dryRun) {
        return {
          editor: snapshotToPayload(snapshot),
          applied: false,
          dryRun: true,
          issues: [],
          result,
          flow: applied.flow
        };
      }
      const next = await this.bridge.applyFlowEdit(snapshot.uri, applied.flow, built.selection?.(applied.results) ?? applied.selection, expectedRevision);
      return {
        editor: snapshotToPayload(next),
        applied: true,
        dryRun: false,
        issues: [],
        result,
        flow: next.flow
      };
    } catch (error) {
      return {
        editor: snapshotToPayload(snapshot),
        applied: false,
        dryRun,
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }
}

function taxonomyUpsertOperation(input: Record<string, unknown>, kind: TaxonomyKind): FlowOperation {
  const item = asRecord(input.item ?? input);
  const id = readOptionalString(input, "id") ?? taxonomyItemId(kind, item);
  return { type: "taxonomy.upsert", kind, id, item };
}

function nodeUpsertOperations(flow: ProductFlow, input: Record<string, unknown>, kind: McpNodeKind): FlowOperation[] {
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

function readNodeDetailsPatch(input: Record<string, unknown>): UpdateNodeDetailsInput {
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

function readUpsertEdgeInput(input: Record<string, unknown>, flow: ProductFlow): UpsertEdgeOperationInput {
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
    condition: readStringPatch(input, "condition"),
    appSurfaceIds: readOptionalStringArray(input, "appSurfaceIds"),
    domainIds: readOptionalStringArray(input, "domainIds"),
    roleIds: readOptionalStringArray(input, "roleIds")
  });
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
  return { kind: "node", nodeId };
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

function readSelectionPatch(input: Record<string, unknown>): FlowSelectionPatch {
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

function schemaPayload(): Record<string, unknown> {
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

function capabilitiesPayload(): Record<string, unknown> {
  return {
    tools: MINDFLOW_MCP_TOOLS.map((tool) => tool.name),
    writesDirectFiles: false,
    requiresUserSave: true,
    supportsSelection: true,
    supportsBatchNodeOperations: true,
    supportsDryRun: true
  };
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

function readNodeKind(input: Record<string, unknown>): McpNodeKind {
  const kind = readOptionalString(input, "kind");
  if (kind && isMcpNodeKind(kind)) {
    return kind;
  }
  throw new Error("Node batch item kind must be layout, navigation, page, popup, or component.");
}

function pageTypeForNodeKind(kind: McpNodeKind): string {
  return kind === "layout" ? "skeleton" : kind;
}

function isMcpNodeKind(value: string): value is McpNodeKind {
  return (MCP_NODE_KINDS as readonly string[]).includes(value);
}

function readStatuses(input: Record<string, unknown>): EntityStatus[] | undefined {
  const raw = input.statuses ?? input.status;
  const values = typeof raw === "string" ? [raw] : readStringArray(raw);
  const statuses = values.filter((value): value is EntityStatus => (ENTITY_STATUSES as readonly string[]).includes(value));
  return statuses.length > 0 ? statuses : undefined;
}

function nodeMatchesFilters(
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

function matchesOptional(value: string, filters: readonly string[] | undefined): boolean {
  return !filters || filters.length === 0 || filters.includes(value);
}

function intersectsOptional(values: readonly string[], filters: readonly string[] | undefined): boolean {
  return !filters || filters.length === 0 || values.some((value) => filters.includes(value));
}

function edgeTouchesAnyNode(edge: FlowEdge, nodeIds: Set<string>): boolean {
  const from = edgeEndpoint(edge, "from");
  const to = edgeEndpoint(edge, "to");
  return endpointReferencesAnyNode(from, nodeIds) || endpointReferencesAnyNode(to, nodeIds);
}

function endpointReferencesAnyNode(endpoint: FlowEndpoint, nodeIds: Set<string>): boolean {
  return endpoint.kind !== "appSurface" && endpoint.kind !== "projectOverview" && nodeIds.has(endpoint.nodeId);
}

function edgeEndpoint(edge: FlowEdge, side: "from" | "to"): FlowEndpoint {
  const endpoint = side === "from" ? edge.from : edge.to;
  return endpoint ?? { kind: "node", nodeId: side === "from" ? edge.fromNodeId : edge.toNodeId };
}

function readBatchItems(input: Record<string, unknown>): Record<string, unknown>[] {
  const items = readRecords(input.nodes ?? input.items);
  if (items.length === 0) {
    throw new Error("Batch node operation requires non-empty nodes or items array.");
  }
  return items;
}

function readRequiredPosition(input: Record<string, unknown>): { x: number; y: number } {
  const x = readOptionalNumber(input, "x");
  const y = readOptionalNumber(input, "y");
  if (x === undefined || y === undefined) {
    throw new Error("Position requires finite x and y numbers.");
  }
  return { x, y };
}

function requiredResult(result: FlowOperationResult | undefined): FlowOperationResult {
  if (!result) {
    throw new Error("MindFlow operation produced no result.");
  }
  return result;
}

function isEdgeTypeValue(value: string): value is EdgeType {
  return (EDGE_TYPES as readonly string[]).includes(value);
}
