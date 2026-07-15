import type { FlowEdge, PageNode, ProductFlow } from "../../../product-flow/domain";
import type { MindFlowEditorBridge } from "../protocol/bridge";
import { readOptionalBoolean, readOptionalString, readOptionalStringArray, requireString } from "./readers";
import { snapshotToPayload } from "./payloads";
import type { McpToolActions } from "./registry";

type QueryKind = "root" | "appSurface" | "domain" | "role" | "statusGroup" | "node" | "featureGroup" | "featureItem" | "edge";

export function createQueryToolActions(bridge: MindFlowEditorBridge): Pick<McpToolActions, "queryEntities"> {
  return {
    queryEntities: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
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
    intersects(node.roleIds, readOptionalStringArray(input, "roleIds"));
}

function edgeMatches(edge: FlowEdge, input: Record<string, unknown>, ids: string[] | undefined, includeRemoved: boolean): boolean {
  return (includeRemoved || edge.status !== "removed") &&
    matchesId(edge.edgeId, ids) &&
    matchesValue(edge.type, readOptionalStringArray(input, "edgeTypes")) &&
    intersects(edge.appSurfaceIds, readOptionalStringArray(input, "appSurfaceIds")) &&
    intersects(edge.domainIds, readOptionalStringArray(input, "domainIds")) &&
    intersects(edge.roleIds, readOptionalStringArray(input, "roleIds"));
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
