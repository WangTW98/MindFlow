import { ensureReasonableNodeLayout } from "../core/canvasLayout";
import { createManualEdge, createManualNode, removeManualEdge, removeManualNode, updateManualEdgeDetails, updateManualNodeDetails, updateManualNodePosition, type UpdateEdgeDetailsInput, type UpdateNodeDetailsInput } from "../core/flowEditing";
import { updateProjectOverview } from "../core/projectOverview";
import { applyTaxonomyRequest, type TaxonomyKind, type TaxonomyRequest } from "../core/taxonomy";
import type { EdgeType, FeatureGroup, FlowEdge, FlowEndpoint, PageNode, ProductFlow } from "../models/productFlow";
import type { FlowSelectionPatch } from "../webview/flowSelection";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "./bridge";
import { MINDFLOW_AUTHORING_GUIDE } from "./authoringGuide";
import { MINDFLOW_MCP_TOOLS } from "./toolSchemas";

export const MCP_EDGE_TYPES = ["interaction", "autoNavigate", "dataFlow", "statusChange", "nestedRelation"] as const;
export type McpEdgeType = typeof MCP_EDGE_TYPES[number];

export interface McpToolResult {
  [key: string]: unknown;
}

interface IdMaps {
  nodes: Map<string, string>;
  domains: Map<string, string>;
  roles: Map<string, string>;
  appSurfaces: Map<string, string>;
  statusGroups: Map<string, string>;
}

interface NodeBuildMeta {
  clientId?: string;
  nodeId: string;
  layer: string;
  parentClientId?: string;
  parentNodeId?: string;
  layoutClientId?: string;
  navigationClientId?: string;
}

export class MindFlowMcpToolHandlers {
  public constructor(private readonly bridge: MindFlowEditorBridge) {}

  public listTools(): typeof MINDFLOW_MCP_TOOLS {
    return MINDFLOW_MCP_TOOLS;
  }

  public async callTool(name: string, args: unknown): Promise<McpToolResult> {
    const input = asRecord(args);
    switch (name) {
      case "mindflow_get_active_flow":
        return this.getActiveFlow(input);
      case "mindflow_get_open_flows":
        return this.getOpenFlows();
      case "mindflow_get_selection":
        return this.getSelection(input);
      case "mindflow_update_project":
        return this.editFlow(input, (flow) => {
          updateProjectOverview(flow, {
            title: readOptionalString(input, "title"),
            summary: readOptionalString(input, "summary"),
            goal: readOptionalString(input, "goal")
          });
          return { projectOverview: flow.projectOverview, title: flow.title };
        });
      case "mindflow_upsert_taxonomy":
        return this.editFlow(input, (flow) => {
          const result = upsertTaxonomyInFlow(flow, input);
          return { taxonomy: result };
        });
      case "mindflow_upsert_node":
        return this.editFlow(input, (flow) => {
          const node = upsertNodeInFlow(flow, input);
          return { node };
        }, (result) => ({ selectedProjectOverview: false, selectedNodeId: (result.node as PageNode).nodeId }));
      case "mindflow_upsert_edge":
        return this.editFlow(input, (flow) => {
          const result = upsertEdgeInFlow(flow, input);
          return result;
        }, (result) => ({ selectedProjectOverview: false, selectedEdgeId: (result.edge as FlowEdge).edgeId }));
      case "mindflow_remove_node":
        return this.editFlow(input, (flow) => {
          const nodeId = requireString(input, "nodeId");
          const result = removeManualNode(flow, nodeId);
          return { removedNodeId: result.node.nodeId, removedEdgeIds: result.removedEdges.map((edge) => edge.edgeId) };
        }, () => ({ selectedProjectOverview: false }));
      case "mindflow_remove_edge":
        return this.editFlow(input, (flow) => {
          const edge = removeManualEdge(flow, requireString(input, "edgeId"));
          return { removedEdgeId: edge.edgeId };
        }, () => ({ selectedProjectOverview: false }));
      case "mindflow_apply_product_design":
        return this.applyProductDesign(input);
      default:
        throw new Error(`Unknown MindFlow MCP tool: ${name}`);
    }
  }

  public readAuthoringGuide(): string {
    return MINDFLOW_AUTHORING_GUIDE;
  }

  private async getActiveFlow(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    return { editor: snapshotToPayload(snapshot), flow: snapshot.flow, selection: buildSelectionPayload(snapshot) };
  }

  private async getOpenFlows(): Promise<McpToolResult> {
    const editors = await this.bridge.getOpenEditors();
    return { editors: editors.map(snapshotToPayload) };
  }

  private async getSelection(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    return { editor: snapshotToPayload(snapshot), selection: buildSelectionPayload(snapshot) };
  }

  private async editFlow(
    input: Record<string, unknown>,
    edit: (flow: ProductFlow, snapshot: MindFlowEditorSnapshot) => McpToolResult,
    selection?: (result: McpToolResult) => FlowSelectionPatch
  ): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const result = edit(snapshot.flow, snapshot);
    const next = await this.bridge.applyFlowEdit(snapshot.uri, snapshot.flow, selection?.(result));
    return { editor: snapshotToPayload(next), result, flow: next.flow };
  }

  private async applyProductDesign(input: Record<string, unknown>): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const flow = snapshot.flow;
    const maps = createIdMaps(flow);
    const nodeMeta: NodeBuildMeta[] = [];

    const project = asRecord(input.project);
    if (Object.keys(project).length > 0) {
      updateProjectOverview(flow, {
        title: readOptionalString(project, "title") ?? readOptionalString(project, "name"),
        summary: readOptionalString(project, "summary") ?? readOptionalString(project, "overview"),
        goal: readOptionalString(project, "goal")
      });
    }

    for (const domain of readRecords(input.domains)) {
      const item = upsertTaxonomyInFlow(flow, { kind: "domain", item: domain, id: readOptionalString(domain, "domainId") });
      rememberMapId(maps.domains, domain, "domainId", item.id);
    }
    for (const role of readRecords(input.roles)) {
      const normalizedRole = { ...role, domainIds: resolveIds(readStringArray(role.domainIds), maps.domains) };
      const item = upsertTaxonomyInFlow(flow, { kind: "role", item: normalizedRole, id: readOptionalString(role, "roleId") });
      rememberMapId(maps.roles, role, "roleId", item.id);
    }
    for (const surface of readRecords(input.appSurfaces ?? input.applications)) {
      const normalizedSurface = {
        ...surface,
        domainIds: resolveIds(readStringArray(surface.domainIds), maps.domains),
        roleIds: resolveIds(readStringArray(surface.roleIds), maps.roles)
      };
      const item = upsertTaxonomyInFlow(flow, { kind: "appSurface", item: normalizedSurface, id: readOptionalString(surface, "appId") });
      rememberMapId(maps.appSurfaces, surface, "appId", item.id);
    }
    if (Array.isArray(input.statusGroups)) {
      for (const statusGroup of readRecords(input.statusGroups)) {
        const item = upsertTaxonomyInFlow(flow, { kind: "statusGroup", item: statusGroup, id: readOptionalString(statusGroup, "statusGroupId") });
        rememberMapId(maps.statusGroups, statusGroup, "statusGroupId", item.id);
      }
    }

    for (const nodeInput of readRecords(input.nodes)) {
      const normalizedNode = normalizeNodeInput(nodeInput, maps);
      const node = upsertNodeInFlow(flow, normalizedNode);
      rememberMapId(maps.nodes, nodeInput, "nodeId", node.nodeId);
      nodeMeta.push({
        clientId: readOptionalString(nodeInput, "clientId") ?? readOptionalString(nodeInput, "id"),
        nodeId: node.nodeId,
        layer: readLayer(nodeInput),
        parentClientId: readOptionalString(nodeInput, "parentClientId"),
        parentNodeId: readOptionalString(nodeInput, "parentNodeId"),
        layoutClientId: readOptionalString(nodeInput, "layoutClientId"),
        navigationClientId: readOptionalString(nodeInput, "navigationClientId")
      });
    }

    for (const meta of nodeMeta) {
      const parentId = resolveHierarchyParent(meta, maps);
      if (parentId) {
        upsertEdgeInFlow(flow, {
          from: { kind: "node", nodeId: parentId },
          to: { kind: "node", nodeId: meta.nodeId },
          type: "nestedRelation",
          trigger: hierarchyTrigger(meta.layer)
        }, maps);
      }
    }
    for (const edgeInput of readRecords(input.edges)) {
      upsertEdgeInFlow(flow, edgeInput, maps);
    }

    ensureReasonableNodeLayout(flow);
    const next = await this.bridge.applyFlowEdit(snapshot.uri, flow);
    return {
      editor: snapshotToPayload(next),
      idMaps: exportIdMaps(maps),
      flow: next.flow
    };
  }
}

function upsertTaxonomyInFlow(flow: ProductFlow, input: Record<string, unknown>): { kind: TaxonomyKind; id: string; item: unknown } {
  const kind = readTaxonomyKind(input);
  const item = asRecord(input.item ?? input);
  const id = readOptionalString(input, "id") ?? taxonomyItemId(kind, item);
  const action = readOptionalString(input, "action") === "delete" ? "delete" : id ? "update" : "create";
  const request: TaxonomyRequest = { kind, action, id, item };
  applyTaxonomyRequest(flow, request);
  if (action === "delete") {
    if (!id) {
      throw new Error(`Deleting ${kind} requires id.`);
    }
    return { kind, id, item: null };
  }
  const resolved = findTaxonomyItem(flow, kind, id, readOptionalString(item, "name") ?? readOptionalString(item, "title"));
  if (!resolved) {
    throw new Error(`Unable to resolve taxonomy item after ${action}: ${kind}`);
  }
  return { kind, id: resolved.id, item: resolved.item };
}

function upsertNodeInFlow(flow: ProductFlow, input: Record<string, unknown>): PageNode {
  const nodeId = readOptionalString(input, "nodeId") ?? readOptionalString(input, "id");
  const existing = nodeId ? flow.nodes.find((node) => node.nodeId === nodeId) : undefined;
  const featureGroups = Array.isArray(input.featureGroups) ? input.featureGroups as FeatureGroup[] : undefined;
  const patch: UpdateNodeDetailsInput = {
    title: readOptionalString(input, "title") ?? readOptionalString(input, "name"),
    pageType: normalizePageType(input),
    purpose: readOptionalString(input, "purpose") ?? readOptionalString(input, "description"),
    appSurfaceIds: readOptionalStringArray(input, "appSurfaceIds"),
    statusGroupId: readOptionalString(input, "statusGroupId"),
    domainIds: readOptionalStringArray(input, "domainIds"),
    roleIds: readOptionalStringArray(input, "roleIds"),
    permissions: readOptionalStringArray(input, "permissions"),
    inputs: readOptionalStringArray(input, "inputs"),
    outputs: readOptionalStringArray(input, "outputs"),
    featureGroups
  };
  const x = readOptionalNumber(input, "x");
  const y = readOptionalNumber(input, "y");
  if (existing) {
    const node = updateManualNodeDetails(flow, existing.nodeId, stripUndefined(patch));
    if (x !== undefined && y !== undefined) {
      updateManualNodePosition(flow, node.nodeId, x, y);
    }
    return node;
  }
  const node = createManualNode(flow, {
    title: patch.title,
    pageType: patch.pageType,
    purpose: patch.purpose,
    x,
    y,
    appSurfaceIds: patch.appSurfaceIds,
    domainIds: patch.domainIds,
    roleIds: patch.roleIds,
    featureGroups
  });
  if (patch.statusGroupId !== undefined || featureGroups !== undefined || patch.permissions !== undefined || patch.inputs !== undefined || patch.outputs !== undefined) {
    updateManualNodeDetails(flow, node.nodeId, stripUndefined(patch));
  }
  return node;
}

function upsertEdgeInFlow(flow: ProductFlow, input: Record<string, unknown>, maps = createIdMaps(flow)): { edge: FlowEdge; mode: "created" | "updated" | "updatedExisting" } {
  const edgeId = readOptionalString(input, "edgeId") ?? readOptionalString(input, "id");
  const existing = edgeId ? flow.edges.find((edge) => edge.edgeId === edgeId) : undefined;
  const from = input.from === undefined && existing ? edgeEndpoint(existing, "from") : readEndpoint(input.from, maps);
  const to = input.to === undefined && existing ? edgeEndpoint(existing, "to") : readEndpoint(input.to, maps);
  if (!from || !to) {
    throw new Error("Edge requires both from and to endpoints.");
  }
  const type = readMcpEdgeType(input, existing?.type);
  const conflict = findSameEndpointEdge(flow, from, to, edgeId);
  if (conflict && conflict.type !== type) {
    throw new Error(`Refusing duplicate endpoints with different edge type. Existing edge ${conflict.edgeId} uses ${conflict.type}.`);
  }
  const patch: UpdateEdgeDetailsInput = stripUndefined({
    from,
    to,
    trigger: readOptionalString(input, "trigger") ?? readOptionalString(input, "action"),
    action: readOptionalString(input, "action"),
    type,
    condition: readOptionalString(input, "condition"),
    appSurfaceIds: readOptionalStringArray(input, "appSurfaceIds"),
    domainIds: readOptionalStringArray(input, "domainIds"),
    roleIds: readOptionalStringArray(input, "roleIds")
  });
  if (conflict) {
    return { edge: updateManualEdgeDetails(flow, conflict.edgeId, patch), mode: "updatedExisting" };
  }
  if (existing) {
    return { edge: updateManualEdgeDetails(flow, existing.edgeId, patch), mode: "updated" };
  }
  const edge = createManualEdge(flow, {
    from,
    to,
    trigger: patch.trigger,
    type
  });
  if (patch.condition !== undefined || patch.appSurfaceIds !== undefined || patch.domainIds !== undefined || patch.roleIds !== undefined) {
    updateManualEdgeDetails(flow, edge.edgeId, patch);
  }
  return { edge, mode: "created" };
}

function readEndpoint(value: unknown, maps: IdMaps): FlowEndpoint | undefined {
  if (typeof value === "string") {
    return { kind: "node", nodeId: resolveId(value, maps.nodes) };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = readOptionalString(value, "kind") ?? "node";
  if (kind === "projectOverview") {
    return { kind: "projectOverview", nodeId: "projectOverview" };
  }
  if (kind === "appSurface") {
    const appId = resolveId(requireStringEither(value, ["appId", "nodeId", "clientId"]), maps.appSurfaces);
    return { kind: "appSurface", nodeId: appId, appId };
  }
  const nodeId = resolveId(requireStringEither(value, ["nodeId", "clientId", "id"]), maps.nodes);
  if (kind === "featureGroup") {
    return { kind: "featureGroup", nodeId, groupId: requireString(value, "groupId") };
  }
  if (kind === "featureItem") {
    return { kind: "featureItem", nodeId, groupId: requireString(value, "groupId"), itemId: requireString(value, "itemId") };
  }
  return { kind: "node", nodeId };
}

function readMcpEdgeType(input: Record<string, unknown>, fallback?: EdgeType): McpEdgeType {
  const explicit = readOptionalString(input, "type") ?? readOptionalString(input, "edgeType");
  if (explicit) {
    if (isMcpEdgeType(explicit)) {
      return explicit;
    }
    throw new Error(`Unsupported MCP edge type: ${explicit}. Use one of ${MCP_EDGE_TYPES.join(", ")}.`);
  }
  if (fallback && isMcpEdgeType(fallback)) {
    return fallback;
  }
  const text = [
    readOptionalString(input, "intent"),
    readOptionalString(input, "trigger"),
    readOptionalString(input, "action"),
    readOptionalString(input, "condition"),
    readOptionalString(input, "description")
  ].filter(Boolean).join(" ").toLowerCase();
  if (/嵌套|包含|父子|布局|导航|组件|nested|contain|layout|navigation|component/.test(text)) {
    return "nestedRelation";
  }
  if (/状态|变更|迁移|status|state/.test(text)) {
    return "statusChange";
  }
  if (/数据|同步|流转|传输|data|sync/.test(text)) {
    return "dataFlow";
  }
  if (/自动|系统|完成后|定时|auto|system|complete/.test(text)) {
    return "autoNavigate";
  }
  return "interaction";
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

function buildSelectionPayload(snapshot: MindFlowEditorSnapshot): Record<string, unknown> {
  const selection = snapshot.selection;
  const selectedNodeIds = selection.selectedNodeIds.length > 0
    ? selection.selectedNodeIds
    : selection.selectedNodeId
      ? [selection.selectedNodeId]
      : [];
  return {
    ...selection,
    selectedNodeIds,
    selectedNodes: selectedNodeIds
      .map((nodeId) => snapshot.flow.nodes.find((node) => node.nodeId === nodeId))
      .filter((node): node is PageNode => Boolean(node)),
    selectedEdge: selection.selectedEdgeId ? snapshot.flow.edges.find((edge) => edge.edgeId === selection.selectedEdgeId) : undefined,
    selectedAppSurface: selection.selectedAppSurfaceId ? snapshot.flow.appSurfaces?.find((surface) => surface.appId === selection.selectedAppSurfaceId) : undefined,
    selectedDomain: selection.selectedDomainId ? snapshot.flow.domains.find((domain) => domain.domainId === selection.selectedDomainId) : undefined,
    selectedRole: selection.selectedRoleId ? snapshot.flow.roles.find((role) => role.roleId === selection.selectedRoleId) : undefined,
    selectedStatusGroup: selection.selectedStatusGroupId ? snapshot.flow.statusGroups?.find((group) => group.statusGroupId === selection.selectedStatusGroupId) : undefined
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

function createIdMaps(flow: ProductFlow): IdMaps {
  return {
    nodes: new Map(flow.nodes.map((node) => [node.nodeId, node.nodeId])),
    domains: new Map(flow.domains.map((domain) => [domain.domainId, domain.domainId])),
    roles: new Map(flow.roles.map((role) => [role.roleId, role.roleId])),
    appSurfaces: new Map((flow.appSurfaces ?? []).map((surface) => [surface.appId, surface.appId])),
    statusGroups: new Map((flow.statusGroups ?? []).map((group) => [group.statusGroupId, group.statusGroupId]))
  };
}

function exportIdMaps(maps: IdMaps): Record<string, Record<string, string>> {
  return {
    nodes: Object.fromEntries(maps.nodes),
    domains: Object.fromEntries(maps.domains),
    roles: Object.fromEntries(maps.roles),
    appSurfaces: Object.fromEntries(maps.appSurfaces),
    statusGroups: Object.fromEntries(maps.statusGroups)
  };
}

function normalizeNodeInput(input: Record<string, unknown>, maps: IdMaps): Record<string, unknown> {
  return {
    ...input,
    pageType: normalizePageType(input),
    appSurfaceIds: resolveIds(readStringArray(input.appSurfaceIds), maps.appSurfaces),
    domainIds: resolveIds(readStringArray(input.domainIds), maps.domains),
    roleIds: resolveIds(readStringArray(input.roleIds), maps.roles),
    statusGroupId: resolveOptionalId(readOptionalString(input, "statusGroupId"), maps.statusGroups)
  };
}

function normalizePageType(input: Record<string, unknown>): string | undefined {
  const explicit = readOptionalString(input, "pageType");
  if (explicit) {
    return explicit;
  }
  const layer = readLayer(input);
  if (layer === "applicationLayout" || layer === "layout") {
    return "skeleton";
  }
  if (layer === "navigation") {
    return "navigation";
  }
  if (layer === "popup" || layer === "modal") {
    return "popup";
  }
  if (layer === "component" || layer === "contentElement") {
    return "component";
  }
  return undefined;
}

function readLayer(input: Record<string, unknown>): string {
  return readOptionalString(input, "layer") ?? readOptionalString(input, "kind") ?? "";
}

function resolveHierarchyParent(meta: NodeBuildMeta, maps: IdMaps): string | undefined {
  const parent = meta.parentClientId ?? meta.parentNodeId;
  if (parent) {
    return resolveId(parent, maps.nodes);
  }
  if (meta.layer === "navigation" && meta.layoutClientId) {
    return resolveId(meta.layoutClientId, maps.nodes);
  }
  if ((meta.layer === "page" || meta.layer === "popup" || meta.layer === "modal") && meta.navigationClientId) {
    return resolveId(meta.navigationClientId, maps.nodes);
  }
  return undefined;
}

function hierarchyTrigger(layer: string): string {
  if (layer === "navigation") {
    return "应用布局包含导航";
  }
  if (layer === "page" || layer === "popup" || layer === "modal") {
    return "导航指向业务页面";
  }
  if (layer === "component" || layer === "contentElement") {
    return "页面包含组件式内容元素";
  }
  return "层级包含关系";
}

function rememberMapId(map: Map<string, string>, source: Record<string, unknown>, idKey: string, realId: string): void {
  map.set(realId, realId);
  const declaredId = readOptionalString(source, idKey);
  const clientId = readOptionalString(source, "clientId") ?? readOptionalString(source, "id");
  if (declaredId) {
    map.set(declaredId, realId);
  }
  if (clientId) {
    map.set(clientId, realId);
  }
}

function resolveIds(values: string[], map: Map<string, string>): string[] {
  return values.map((value) => resolveId(value, map));
}

function resolveOptionalId(value: string | undefined, map: Map<string, string>): string | undefined {
  return value ? resolveId(value, map) : undefined;
}

function resolveId(value: string, map: Map<string, string>): string {
  return map.get(value) ?? value;
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

function readTaxonomyKind(input: Record<string, unknown>): TaxonomyKind {
  const kind = readOptionalString(input, "kind");
  if (kind === "domain" || kind === "role" || kind === "appSurface" || kind === "statusGroup") {
    return kind;
  }
  throw new Error("Taxonomy kind must be domain, role, appSurface, or statusGroup.");
}

function isMcpEdgeType(value: string): value is McpEdgeType {
  return (MCP_EDGE_TYPES as readonly string[]).includes(value);
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

function readRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
