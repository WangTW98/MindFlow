import { emptyFlowSelection, normalizeFlowSelection, type FlowSelectionPatch, type FlowSelectionState } from "../core/editorSelection";
import {
  applyFlowOperation,
  applyFlowOperations,
  type FlowOperation,
  type FlowOperationResult,
  type UpdateEdgeDetailsInput,
  type UpdateNodeDetailsInput,
  type UpsertEdgeOperationInput
} from "../core/flowOperations";
import { PROJECT_OVERVIEW_NODE_ID } from "../core/projectOverview";
import type { TaxonomyKind } from "../core/taxonomy";
import { APP_SURFACE_TYPES, EDGE_TYPES, ENTITY_STATUSES, FLOW_ENDPOINT_KINDS, type EdgeType, type EntityStatus, type FeatureGroup, type FlowEdge, type FlowEndpoint, type PageNode, type ProductFlow } from "../models/productFlow";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "./bridge";
import { MINDFLOW_OPERATIONS_REFERENCE } from "./operationsReference";
import { MINDFLOW_MCP_TOOLS } from "./toolSchemas";

export const MCP_NODE_KINDS = ["layout", "navigation", "page", "popup", "component"] as const;
export type McpNodeKind = typeof MCP_NODE_KINDS[number];

export interface McpToolResult {
  [key: string]: unknown;
}

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
  public constructor(private readonly bridge: MindFlowEditorBridge) {}

  public listTools(): typeof MINDFLOW_MCP_TOOLS {
    return MINDFLOW_MCP_TOOLS;
  }

  public async callTool(name: string, args: unknown): Promise<McpToolResult> {
    const input = asRecord(args);
    switch (name) {
      case "mindflow_get_editor_state":
      case "mindflow_get_active_flow":
        return this.getEditorState(input);
      case "mindflow_get_open_editors":
      case "mindflow_get_open_flows":
        return this.getOpenEditors();
      case "mindflow_get_selection":
        return this.getSelection(input);
      case "mindflow_set_selection":
        return this.setSelection(input);
      case "mindflow_clear_selection":
        return this.clearSelection(input);
      case "mindflow_update_root":
      case "mindflow_update_project":
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
      case "mindflow_move_root":
        return this.editFlow(input, () => ({
          operations: [{ type: "project.move", ...readRequiredPosition(input) }]
        }));
      case "mindflow_upsert_app_surface":
        return this.editFlow(input, () => ({
          operations: [taxonomyUpsertOperation(input, "appSurface")]
        }));
      case "mindflow_remove_app_surface":
        return this.editFlow(input, () => ({
          operations: [{ type: "taxonomy.remove", kind: "appSurface", id: requireStringEither(input, ["appId", "id"]) }]
        }));
      case "mindflow_move_app_surface":
        return this.editFlow(input, () => {
          const position = readRequiredPosition(input);
          return {
            operations: [{ type: "appSurface.move", appId: requireStringEither(input, ["appId", "id"]), x: position.x, y: position.y }]
          };
        });
      case "mindflow_upsert_domain":
        return this.upsertTaxonomy(input, "domain");
      case "mindflow_remove_domain":
        return this.removeTaxonomy(input, "domain", ["domainId", "id"]);
      case "mindflow_upsert_role":
        return this.upsertTaxonomy(input, "role");
      case "mindflow_remove_role":
        return this.removeTaxonomy(input, "role", ["roleId", "id"]);
      case "mindflow_upsert_status_group":
        return this.upsertTaxonomy(input, "statusGroup");
      case "mindflow_remove_status_group":
        return this.removeTaxonomy(input, "statusGroup", ["statusGroupId", "id"]);
      case "mindflow_upsert_layout_node":
        return this.upsertTypedNode(input, "layout");
      case "mindflow_upsert_navigation_node":
        return this.upsertTypedNode(input, "navigation");
      case "mindflow_upsert_page_node":
      case "mindflow_upsert_node":
        return this.upsertTypedNode(input, "page");
      case "mindflow_upsert_popup_node":
        return this.upsertTypedNode(input, "popup");
      case "mindflow_upsert_component_node":
        return this.upsertTypedNode(input, "component");
      case "mindflow_update_node":
        return this.editFlow(input, () => ({
          operations: [{ type: "node.update", nodeId: requireStringEither(input, ["nodeId", "id"]), patch: stripUndefined(readNodeDetailsPatch(input)) }]
        }));
      case "mindflow_move_node":
        return this.editFlow(input, () => {
          const position = readRequiredPosition(input);
          return {
            operations: [{ type: "node.move", nodeId: requireStringEither(input, ["nodeId", "id"]), x: position.x, y: position.y }]
          };
        });
      case "mindflow_remove_node":
        return this.editFlow(input, () => ({
          operations: [{ type: "node.remove", nodeId: requireStringEither(input, ["nodeId", "id"]) }]
        }));
      case "mindflow_upsert_edge":
        return this.editFlow(input, (flow) => ({
          operations: [{ type: "edge.upsert", input: readUpsertEdgeInput(input, flow) }]
        }));
      case "mindflow_remove_edge":
        return this.editFlow(input, () => ({
          operations: [{ type: "edge.remove", edgeId: requireStringEither(input, ["edgeId", "id"]) }]
        }));
      case "mindflow_batch_get_nodes":
        return this.batchGetNodes(input);
      case "mindflow_batch_upsert_nodes":
        return this.batchEditNodes(input, (flow, items) => ({
          operations: items.flatMap((item) => nodeUpsertOperations(flow, item, readNodeKind(item))),
          result: (results) => ({ nodes: resultNodes(results) }),
          selection: (results) => batchSelectionPatch(resultNodes(results), true)
        }));
      case "mindflow_batch_update_nodes":
        return this.batchEditNodes(input, (_flow, items) => ({
          operations: items.map((item) => ({ type: "node.update", nodeId: requireStringEither(item, ["nodeId", "id"]), patch: stripUndefined(readNodeDetailsPatch(item)) })),
          result: (results) => ({ nodes: resultNodes(results) }),
          selection: (results) => batchSelectionPatch(resultNodes(results), true)
        }));
      case "mindflow_batch_move_nodes":
        return this.batchEditNodes(input, (_flow, items) => ({
          operations: items.map((item) => {
            const position = readRequiredPosition(item);
            return { type: "node.move", nodeId: requireStringEither(item, ["nodeId", "id"]), x: position.x, y: position.y };
          }),
          result: (results) => ({ nodes: resultNodes(results) }),
          selection: (results) => batchSelectionPatch(resultNodes(results), true)
        }));
      case "mindflow_batch_remove_nodes":
        return this.batchEditNodes(input, (_flow, items) => ({
          operations: items.map((item) => ({ type: "node.remove", nodeId: requireStringEither(item, ["nodeId", "id"]) })),
          result: (results) => ({
            removedNodeIds: results.flatMap((result) => result.type === "node.remove" ? [result.removedNodeId] : []),
            removedEdgeIds: Array.from(new Set(results.flatMap((result) => result.type === "node.remove" ? result.removedEdgeIds : [])))
          })
        }));
      default:
        throw new Error(`Unknown MindFlow MCP tool: ${name}`);
    }
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

function buildHydratedSelection(snapshot: MindFlowEditorSnapshot): Record<string, unknown> {
  const flow = snapshot.flow;
  const selection = normalizeFlowSelection(snapshot.selection);
  return {
    selectedRoot: selection.selectedProjectOverview ? rootPayload(flow) : undefined,
    selectedNodes: selection.selectedNodeIds.map((nodeId) => flow.nodes.find((node) => node.nodeId === nodeId)).filter((node): node is PageNode => Boolean(node)),
    selectedNode: selection.selectedNodeId ? flow.nodes.find((node) => node.nodeId === selection.selectedNodeId) : undefined,
    selectedEdge: selection.selectedEdgeId ? flow.edges.find((edge) => edge.edgeId === selection.selectedEdgeId) : undefined,
    selectedAppSurface: selection.selectedAppSurfaceId ? flow.appSurfaces?.find((surface) => surface.appId === selection.selectedAppSurfaceId) : undefined,
    selectedDomain: selection.selectedDomainId ? flow.domains.find((domain) => domain.domainId === selection.selectedDomainId) : undefined,
    selectedRole: selection.selectedRoleId ? flow.roles.find((role) => role.roleId === selection.selectedRoleId) : undefined,
    selectedStatusGroup: selection.selectedStatusGroupId ? flow.statusGroups?.find((group) => group.statusGroupId === selection.selectedStatusGroupId) : undefined
  };
}

function buildSelectionIssues(snapshot: MindFlowEditorSnapshot): Array<Record<string, string>> {
  const flow = snapshot.flow;
  const selection = normalizeFlowSelection(snapshot.selection);
  const issues: Array<Record<string, string>> = [];
  for (const nodeId of selection.selectedNodeIds) {
    if (!flow.nodes.some((node) => node.nodeId === nodeId)) {
      issues.push(selectionIssue("selectedNodeIds", nodeId, "Selected node is missing."));
    }
  }
  if (selection.selectedNodeId && !flow.nodes.some((node) => node.nodeId === selection.selectedNodeId)) {
    issues.push(selectionIssue("selectedNodeId", selection.selectedNodeId, "Selected node is missing."));
  }
  if (selection.selectedEdgeId && !flow.edges.some((edge) => edge.edgeId === selection.selectedEdgeId)) {
    issues.push(selectionIssue("selectedEdgeId", selection.selectedEdgeId, "Selected edge is missing."));
  }
  if (selection.selectedAppSurfaceId && !flow.appSurfaces?.some((surface) => surface.appId === selection.selectedAppSurfaceId)) {
    issues.push(selectionIssue("selectedAppSurfaceId", selection.selectedAppSurfaceId, "Selected app surface is missing."));
  }
  if (selection.selectedDomainId && !flow.domains.some((domain) => domain.domainId === selection.selectedDomainId)) {
    issues.push(selectionIssue("selectedDomainId", selection.selectedDomainId, "Selected domain is missing."));
  }
  if (selection.selectedRoleId && !flow.roles.some((role) => role.roleId === selection.selectedRoleId)) {
    issues.push(selectionIssue("selectedRoleId", selection.selectedRoleId, "Selected role is missing."));
  }
  if (selection.selectedStatusGroupId && !flow.statusGroups?.some((group) => group.statusGroupId === selection.selectedStatusGroupId)) {
    issues.push(selectionIssue("selectedStatusGroupId", selection.selectedStatusGroupId, "Selected status group is missing."));
  }
  return issues;
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

function operationPayload(result: FlowOperationResult): McpToolResult {
  switch (result.type) {
    case "project.update":
    case "project.move":
      return { root: result.root };
    case "taxonomy.upsert":
      return { taxonomy: result.taxonomy };
    case "taxonomy.remove":
      return { taxonomy: result.taxonomy, removedId: result.removedId };
    case "appSurface.move":
      return { appSurface: result.appSurface };
    case "node.create":
    case "node.update":
    case "node.move":
      return { node: result.node };
    case "node.remove":
      return { removedNodeId: result.removedNodeId, removedEdgeIds: result.removedEdgeIds };
    case "node.createConnected":
      return { node: result.node, edge: result.edge };
    case "edge.upsert":
      return { edge: result.edge, mode: result.mode };
    case "edge.update":
      return { edge: result.edge };
    case "edge.remove":
      return { removedEdgeId: result.removedEdgeId };
  }
}

function resultNodes(results: readonly FlowOperationResult[]): PageNode[] {
  return results.flatMap((result) =>
    result.type === "node.create" || result.type === "node.update" || result.type === "node.move" || result.type === "node.createConnected"
      ? [result.node]
      : []
  );
}

function batchSelectionPatch(nodes: PageNode[], selectResultNodes: boolean): FlowSelectionPatch | undefined {
  if (!selectResultNodes) {
    return undefined;
  }
  const selectedNodeIds = nodes.map((node) => node.nodeId);
  return selectedNodeIds.length > 0
    ? { selectedProjectOverview: false, selectedNodeId: selectedNodeIds[selectedNodeIds.length - 1], selectedNodeIds }
    : undefined;
}

function rootPayload(flow: ProductFlow): Record<string, unknown> {
  return {
    nodeId: PROJECT_OVERVIEW_NODE_ID,
    title: flow.title,
    projectOverview: flow.projectOverview
  };
}

function snapshotToPayload(snapshot: MindFlowEditorSnapshot): Record<string, unknown> {
  return {
    uri: snapshot.uri,
    path: snapshot.path,
    displayName: snapshot.displayName,
    active: snapshot.active,
    dirty: snapshot.dirty,
    revision: snapshot.flow.revision,
    title: snapshot.flow.title
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

function selectionIssue(field: string, id: string, message: string): Record<string, string> {
  return { field, id, message };
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = readOptionalString(record, key);
  if (!value) {
    throw new Error(`Missing required string field: ${key}`);
  }
  return value;
}

function requireStringEither(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readOptionalString(record, key);
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing required string field: ${keys.join(" or ")}`);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringPatch(record: Record<string, unknown>, key: string): string | undefined {
  return key in record && typeof record[key] === "string" ? record[key].trim() : undefined;
}

function readOptionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  return Array.isArray(record[key]) ? readStringArray(record[key]) : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  return typeof record[key] === "boolean" ? record[key] : undefined;
}

function readRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function resolveId(value: string, map: Map<string, string>): string {
  return map.get(value) ?? value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEdgeTypeValue(value: string): value is EdgeType {
  return (EDGE_TYPES as readonly string[]).includes(value);
}
