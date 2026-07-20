import type { FlowEdge, PageNode, ProductFlow } from "../../../product-flow/domain";
import type { MindFlowEditorBridge } from "../protocol/bridge";
import { readOptionalBoolean, readOptionalNumber, readOptionalString, readOptionalStringArray, requireString } from "./readers";
import { snapshotToPayload } from "./payloads";
import type { McpToolActions } from "./registry";

type QueryKind = "root" | "appSurface" | "domain" | "role" | "statusGroup" | "node" | "featureGroup" | "featureItem" | "edge";

export function createQueryToolActions(bridge: MindFlowEditorBridge): Pick<McpToolActions, "queryEntities" | "getSubgraph" | "tracePaths"> {
  return {
    queryEntities: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      assertExpectedRevision(snapshot.flow, readOptionalNumber(input, "expectedRevision"));
      const kind = requireString(input, "entityKind") as QueryKind;
      const limit = readLimit(input.limit);
      const offset = readCursor(readOptionalString(input, "cursor"));
      const allItems = queryItems(snapshot.flow, kind, input);
      const items = allItems.slice(offset, offset + limit);
      const nextOffset = offset + items.length;
      return {
        editor: snapshotToPayload(snapshot),
        entityKind: kind,
        items,
        page: {
          offset,
          limit,
          total: allItems.length,
          nextCursor: nextOffset < allItems.length ? String(nextOffset) : undefined
        }
      };
    },
    getSubgraph: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      assertExpectedRevision(snapshot.flow, readOptionalNumber(input, "expectedRevision"));
      const includeRemoved = readOptionalBoolean(input, "includeRemoved") === true;
      const direction = readOptionalString(input, "direction") ?? "both";
      const depth = boundedInteger(input.depth, 1, 5, 1);
      const edgeTypes = readOptionalStringArray(input, "edgeTypes");
      const seedIds = new Set([
        ...(readOptionalStringArray(input, "nodeIds") ?? []),
        ...(readOptionalStringArray(input, "appSurfaceIds") ?? []),
        ...(readOptionalBoolean(input, "includeRoot") === true ? ["projectOverview"] : [])
      ]);
      if (seedIds.size === 0) throw new Error("Subgraph query requires nodeIds, appSurfaceIds, or includeRoot=true.");
      assertKnownStorageIds(snapshot.flow, seedIds, includeRemoved, "Subgraph seed");
      const edges = snapshot.flow.edges.filter((edge) => (includeRemoved || edge.status !== "removed") && matchesValue(edge.type, edgeTypes));
      const includedIds = new Set(seedIds);
      let frontier = new Set(seedIds);
      const includedEdges = new Map<string, FlowEdge>();
      for (let level = 0; level < depth && frontier.size > 0; level += 1) {
        const next = new Set<string>();
        for (const edge of edges) {
          const fromId = edge.from.nodeId;
          const toId = edge.to.nodeId;
          const followsOutgoing = direction !== "incoming" && frontier.has(fromId);
          const followsIncoming = direction !== "outgoing" && frontier.has(toId);
          if (!followsOutgoing && !followsIncoming) continue;
          includedEdges.set(edge.edgeId, edge);
          const adjacentId = followsOutgoing ? toId : fromId;
          if (!includedIds.has(adjacentId)) next.add(adjacentId);
          includedIds.add(fromId);
          includedIds.add(toId);
        }
        frontier = next;
      }
      return subgraphPayload(snapshot, includedIds, [...includedEdges.values()], includeRemoved, frontier);
    },
    tracePaths: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      assertExpectedRevision(snapshot.flow, readOptionalNumber(input, "expectedRevision"));
      const fromId = requireString(input, "fromId");
      const toId = requireString(input, "toId");
      assertKnownStorageIds(snapshot.flow, new Set([fromId, toId]), false, "Path endpoint");
      const maxDepth = boundedInteger(input.maxDepth, 1, 12, 8);
      const maxPaths = boundedInteger(input.maxPaths, 1, 50, 20);
      const edgeTypes = readOptionalStringArray(input, "edgeTypes");
      const outgoing = new Map<string, FlowEdge[]>();
      for (const edge of snapshot.flow.edges) {
        if (edge.status === "removed" || !matchesValue(edge.type, edgeTypes)) continue;
        const list = outgoing.get(edge.from.nodeId) ?? [];
        list.push(edge);
        outgoing.set(edge.from.nodeId, list);
      }
      const queue: Array<{ nodeIds: string[]; edgeIds: string[] }> = [{ nodeIds: [fromId], edgeIds: [] }];
      const paths: Array<{ nodeIds: string[]; edgeIds: string[] }> = [];
      const maxExploredPaths = 10_000;
      let exploredPathCount = 0;
      while (queue.length > 0 && paths.length < maxPaths && exploredPathCount < maxExploredPaths) {
        const path = queue.shift()!;
        exploredPathCount += 1;
        const current = path.nodeIds.at(-1)!;
        if (current === toId) {
          paths.push(path);
          continue;
        }
        if (path.edgeIds.length >= maxDepth) continue;
        for (const edge of outgoing.get(current) ?? []) {
          const nextId = edge.to.nodeId;
          if (path.nodeIds.includes(nextId)) continue;
          queue.push({ nodeIds: [...path.nodeIds, nextId], edgeIds: [...path.edgeIds, edge.edgeId] });
        }
      }
      return {
        editor: snapshotToPayload(snapshot),
        fromId,
        toId,
        paths,
        exploredPathCount,
        truncated: queue.length > 0
      };
    }
  };
}

function queryItems(flow: ProductFlow, kind: QueryKind, input: Record<string, unknown>): unknown[] {
  const ids = readOptionalStringArray(input, "ids");
  const includeRemoved = readOptionalBoolean(input, "includeRemoved") === true;
  if (kind === "root") {
    return [{ flowId: flow.flowId, title: flow.title, projectOverview: flow.projectOverview, revision: flow.revision }];
  }
  if (kind === "appSurface") {
    return flow.appSurfaces.filter((item) => matchesId(item.appId, ids));
  }
  if (kind === "domain") {
    return flow.domains.filter((item) => matchesId(item.domainId, ids));
  }
  if (kind === "role") {
    return flow.roles.filter((item) => matchesId(item.roleId, ids));
  }
  if (kind === "statusGroup") {
    return flow.statusGroups.filter((item) => matchesId(item.statusGroupId, ids));
  }
  if (kind === "node") {
    return flow.nodes.filter((node) => nodeMatches(node, input, ids, includeRemoved));
  }
  if (kind === "featureGroup") {
    return flow.nodes
      .filter((node) => nodeMatches(node, input, undefined, includeRemoved))
      .flatMap((node) => node.featureGroups.map((group) => ({ nodeId: node.nodeId, ...group })))
      .filter((group) => matchesId(group.groupId, ids));
  }
  if (kind === "featureItem") {
    return flow.nodes
      .filter((node) => nodeMatches(node, input, undefined, includeRemoved))
      .flatMap((node) => node.featureGroups.flatMap((group) => group.items.map((item) => ({ nodeId: node.nodeId, groupId: group.groupId, ...item }))))
      .filter((item) => matchesId(item.itemId, ids));
  }
  return flow.edges.filter((edge) => edgeMatches(edge, input, ids, includeRemoved));
}

function nodeMatches(node: PageNode, input: Record<string, unknown>, ids: string[] | undefined, includeRemoved: boolean): boolean {
  return (includeRemoved || node.status !== "removed") &&
    matchesId(node.nodeId, ids) &&
    matchesValue(node.pageType, readOptionalStringArray(input, "pageTypes")) &&
    intersects(node.appSurfaceIds, readOptionalStringArray(input, "appSurfaceIds")) &&
    intersects(node.domainIds, readOptionalStringArray(input, "domainIds")) &&
    intersects(node.roleIds, readOptionalStringArray(input, "roleIds")) &&
    matchesValue(node.status, readOptionalStringArray(input, "statuses")) &&
    matchesValue(node.statusGroupId ?? "", readOptionalStringArray(input, "statusGroupIds")) &&
    matchesText([node.title, node.purpose, node.pageType], readOptionalString(input, "text"));
}

function edgeMatches(edge: FlowEdge, input: Record<string, unknown>, ids: string[] | undefined, includeRemoved: boolean): boolean {
  return (includeRemoved || edge.status !== "removed") &&
    matchesId(edge.edgeId, ids) &&
    matchesValue(edge.type, readOptionalStringArray(input, "edgeTypes")) &&
    intersects(edge.appSurfaceIds, readOptionalStringArray(input, "appSurfaceIds")) &&
    intersects(edge.domainIds, readOptionalStringArray(input, "domainIds")) &&
    intersects(edge.roleIds, readOptionalStringArray(input, "roleIds")) &&
    matchesValue(edge.status, readOptionalStringArray(input, "statuses")) &&
    intersects([edge.from.nodeId], readOptionalStringArray(input, "fromNodeIds")) &&
    intersects([edge.to.nodeId], readOptionalStringArray(input, "toNodeIds")) &&
    matchesText([edge.trigger, edge.action, edge.condition, edge.type], readOptionalString(input, "text"));
}

function assertExpectedRevision(flow: ProductFlow, expectedRevision: number | undefined): void {
  if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || flow.revision !== expectedRevision)) {
    throw new Error(`ProductFlow revision conflict. Expected ${expectedRevision}, found ${flow.revision}.`);
  }
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function matchesText(values: unknown[], query: string | undefined): boolean {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase();
  return values.some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(normalized));
}

function subgraphPayload(
  snapshot: Awaited<ReturnType<MindFlowEditorBridge["getActiveEditor"]>>,
  includedIds: Set<string>,
  edges: FlowEdge[],
  includeRemoved: boolean,
  frontier: Set<string>
): Record<string, unknown> {
  const flow = snapshot.flow;
  const nodes = flow.nodes.filter((node) => includedIds.has(node.nodeId) && (includeRemoved || node.status !== "removed"));
  const appSurfaces = flow.appSurfaces.filter((surface) => includedIds.has(surface.appId));
  const domainIds = new Set([...nodes.flatMap((node) => node.domainIds), ...appSurfaces.flatMap((surface) => surface.domainIds)]);
  const roleIds = new Set([...nodes.flatMap((node) => node.roleIds), ...appSurfaces.flatMap((surface) => surface.roleIds)]);
  const statusGroupIds = new Set(nodes.flatMap((node) => node.statusGroupId ? [node.statusGroupId] : []));
  return {
    editor: snapshotToPayload(snapshot),
    root: includedIds.has("projectOverview") ? { flowId: flow.flowId, title: flow.title, projectOverview: flow.projectOverview } : undefined,
    appSurfaces,
    domains: flow.domains.filter((domain) => domainIds.has(domain.domainId)),
    roles: flow.roles.filter((role) => roleIds.has(role.roleId)),
    statusGroups: flow.statusGroups.filter((group) => statusGroupIds.has(group.statusGroupId)),
    nodes,
    edges,
    boundaryIds: [...frontier],
    boundaryNodeIds: [...frontier].filter((id) => nodes.some((node) => node.nodeId === id))
  };
}

function assertKnownStorageIds(flow: ProductFlow, ids: Set<string>, includeRemoved: boolean, label: string): void {
  const known = new Set([
    "projectOverview",
    ...flow.appSurfaces.map((surface) => surface.appId),
    ...flow.nodes.filter((node) => includeRemoved || node.status !== "removed").map((node) => node.nodeId)
  ]);
  const unknown = [...ids].filter((id) => !known.has(id));
  if (unknown.length > 0) throw new Error(`${label} contains unknown ids: ${unknown.join(", ")}.`);
}

function readLimit(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? Math.max(1, Math.min(200, value)) : 100;
}

function readCursor(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const cursor = Number(value);
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("Query cursor must be a non-negative integer string.");
  }
  return cursor;
}

function matchesId(value: string, ids: string[] | undefined): boolean {
  return !ids || ids.length === 0 || ids.includes(value);
}

function matchesValue(value: string, filters: string[] | undefined): boolean {
  return !filters || filters.length === 0 || filters.includes(value);
}

function intersects(values: readonly string[], filters: string[] | undefined): boolean {
  return !filters || filters.length === 0 || values.some((value) => filters.includes(value));
}
