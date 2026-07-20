import { applyFlowOperations, type FlowOperation } from "../../../product-flow/application/operations";
import {
  validateProductFlow,
  type FeatureGroup,
  type FlowEndpoint,
  type ProductFlow
} from "../../../product-flow/domain";
import { shortHash, slugify } from "../../../product-flow/domain/id";
import type { MindFlowEditorBridge } from "../protocol/bridge";
import { operationPayload, snapshotToPayload } from "./payloads";
import {
  asRecord,
  isRecord,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  readRecords,
  requireString,
  stripUndefined
} from "./readers";
import { nodeUpsertOperations, readEndpoint, readMcpEdgeType, readSelectionPatch } from "./toolInputReaders";
import type { McpToolActions } from "./registry";
import type { IdMaps } from "./types";

interface ChangeMaps extends IdMaps {
  domains: Map<string, string>;
  roles: Map<string, string>;
  statusGroups: Map<string, string>;
  featureGroups: Map<string, string>;
  featureItems: Map<string, string>;
  edges: Map<string, string>;
}

export function createChangesetToolActions(bridge: MindFlowEditorBridge): Pick<McpToolActions, "applyCanvasChanges"> {
  return {
    applyCanvasChanges: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      const expectedRevision = readExpectedRevision(input.expectedRevision);
      if (snapshot.flow.revision !== expectedRevision) {
        throw new Error(`ProductFlow revision conflict. Expected ${expectedRevision}, found ${snapshot.flow.revision}.`);
      }
      const rawOperations = readRecords(input.operations);
      const dryRun = readOptionalBoolean(input, "dryRun") === true;
      let maps: ChangeMaps | undefined;
      let applied;
      try {
        enforceBatchBounds(rawOperations);
        const preparedMaps = prepareMaps(snapshot.flow, rawOperations);
        maps = preparedMaps;
        const operations = rawOperations
          .map((operation, index) => ({ operation, index }))
          .sort((left, right) => operationWeight(left.operation) - operationWeight(right.operation) || left.index - right.index)
          .flatMap(({ operation }) => buildOperations(snapshot.flow, operation, preparedMaps));
        applied = applyFlowOperations(snapshot.flow, operations, { atomic: true, dryRun });
      } catch (error) {
        if (!dryRun) throw error;
        return {
          editor: snapshotToPayload(snapshot), applied: false, dryRun: true,
          batch: batchPayload(input),
          idMap: maps ? publicIdMap(maps) : {}, operations: [],
          errors: [error instanceof Error ? error.message : String(error)], warnings: [],
          changeSummary: summarizeChange([], snapshot.flow, snapshot.flow.revision),
          change: { operationCount: 0, revision: snapshot.flow.revision }
        };
      }
      if (!maps) {
        throw new Error("MindFlow changeset reference maps were not initialized.");
      }
      const validation = validateProductFlow(applied.flow);
      if (!validation.valid) {
        if (dryRun) {
          return {
            editor: snapshotToPayload(snapshot), applied: false, dryRun: true,
            batch: batchPayload(input),
            idMap: publicIdMap(maps), operations: applied.results.map(operationPayload),
            errors: validation.errors, warnings: validation.warnings,
            summary: summarize(applied.flow),
            changeSummary: summarizeChange(applied.results, snapshot.flow, applied.flow.revision),
            change: { operationCount: applied.results.length, revision: applied.flow.revision }
          };
        }
        throw new Error(`Canvas changeset is invalid:\n${validation.errors.join("\n")}`);
      }
      const result = {
        applied: !dryRun,
        dryRun,
        batch: batchPayload(input),
        idMap: publicIdMap(maps),
        operations: applied.results.map(operationPayload),
        validation,
        summary: summarize(applied.flow),
        changeSummary: summarizeChange(applied.results, snapshot.flow, applied.flow.revision),
        change: { operationCount: applied.results.length, revision: applied.flow.revision }
      };
      if (dryRun) {
        return {
          editor: snapshotToPayload(snapshot),
          ...result,
          ...(readOptionalBoolean(input, "includeFlow") === true ? { flow: applied.flow } : {})
        };
      }
      const selection = isRecord(input.selection) ? readSelectionPatch(input.selection) : applied.selection;
      const next = await bridge.applyFlowEdit(snapshot.uri, applied.flow, selection, expectedRevision);
      return {
        editor: snapshotToPayload(next),
        ...result,
        changeSummary: summarizeChange(applied.results, snapshot.flow, next.flow.revision),
        change: { operationCount: applied.results.length, revision: next.flow.revision },
        ...(readOptionalBoolean(input, "includeFlow") === true ? { flow: next.flow } : {})
      };
    }
  };
}

function batchPayload(input: Record<string, unknown>): Record<string, string | undefined> {
  return { id: readOptionalString(input, "batchId"), label: readOptionalString(input, "batchLabel") };
}

function summarizeChange(results: ReturnType<typeof applyFlowOperations>["results"], beforeFlow: ProductFlow, afterRevision: number): Record<string, unknown> {
  const createdIds: string[] = [];
  const updatedIds: string[] = [];
  const movedIds: string[] = [];
  const removedIds: string[] = [];
  const cascadedRemovedEdgeIds = new Set<string>();
  for (const result of results) {
    if (result.type === "node.create" || result.type === "node.createConnected") createdIds.push(result.node.nodeId);
    else if (result.type === "node.paste") createdIds.push(...result.nodes.map((node) => node.nodeId));
    else if (result.type === "node.update") updatedIds.push(result.node.nodeId);
    else if (result.type === "node.move") movedIds.push(result.node.nodeId);
    else if (result.type === "node.remove") {
      removedIds.push(result.removedNodeId);
      result.removedEdgeIds.forEach((edgeId) => cascadedRemovedEdgeIds.add(edgeId));
    } else if (result.type === "edge.upsert") {
      (result.mode === "created" ? createdIds : updatedIds).push(result.edge.edgeId);
    } else if (result.type === "edge.update") updatedIds.push(result.edge.edgeId);
    else if (result.type === "edge.remove") removedIds.push(result.removedEdgeId);
    else if (result.type === "taxonomy.upsert") {
      (taxonomyExists(beforeFlow, result.taxonomy.kind, result.taxonomy.id) ? updatedIds : createdIds).push(result.taxonomy.id);
    }
    else if (result.type === "taxonomy.remove") removedIds.push(result.removedId);
    else if (result.type === "appSurface.move") movedIds.push(result.appSurface.appId);
    else if (result.type === "project.move") movedIds.push("projectOverview");
    else if (result.type === "project.update") updatedIds.push("projectOverview");
  }
  return {
    beforeRevision: beforeFlow.revision,
    afterRevision,
    createdIds: [...new Set(createdIds)],
    updatedIds: [...new Set(updatedIds)],
    movedIds: [...new Set(movedIds)],
    removedIds: [...new Set(removedIds)],
    cascadedRemovedEdgeIds: [...cascadedRemovedEdgeIds]
  };
}

function taxonomyExists(flow: ProductFlow, kind: "domain" | "role" | "appSurface" | "statusGroup", id: string): boolean {
  if (kind === "domain") return flow.domains.some((item) => item.domainId === id);
  if (kind === "role") return flow.roles.some((item) => item.roleId === id);
  if (kind === "appSurface") return flow.appSurfaces.some((item) => item.appId === id);
  return flow.statusGroups.some((item) => item.statusGroupId === id);
}

function prepareMaps(flow: ProductFlow, operations: Record<string, unknown>[]): ChangeMaps {
  const maps: ChangeMaps = {
    nodes: identityMap(flow.nodes.map((item) => item.nodeId)),
    appSurfaces: identityMap(flow.appSurfaces.map((item) => item.appId)),
    domains: identityMap(flow.domains.map((item) => item.domainId)),
    roles: identityMap(flow.roles.map((item) => item.roleId)),
    statusGroups: identityMap(flow.statusGroups.map((item) => item.statusGroupId)),
    featureGroups: identityMap(flow.nodes.flatMap((node) => node.featureGroups.map((group) => group.groupId))),
    featureItems: identityMap(flow.nodes.flatMap((node) => node.featureGroups.flatMap((group) => group.items.map((item) => item.itemId)))),
    edges: identityMap(flow.edges.map((edge) => edge.edgeId))
  };
  const seenLocalRefs = new Set<string>();
  for (const operation of operations) {
    const op = requireString(operation, "op");
    if (op === "taxonomy.upsert") {
      const kind = requireString(operation, "kind");
      const localRef = readOptionalString(operation, "localRef");
      if (localRef) {
        claimLocalRef(localRef, seenLocalRefs);
        taxonomyMap(maps, kind).set(localRef, readOptionalString(operation, "id") ?? generatedTaxonomyId(kind, localRef));
      }
    }
    if (op === "node.upsert") {
      const localRef = readOptionalString(operation, "localRef");
      if (localRef) {
        claimLocalRef(localRef, seenLocalRefs);
        const title = readOptionalString(nodePayload(operation), "title") ?? localRef;
        maps.nodes.set(localRef, readOptionalString(operation, "nodeId") ?? readOptionalString(operation, "id") ?? `page_${slugify(title, "page")}_${shortHash(localRef, 6)}`);
      }
      scanFeatureRefs(nodePayload(operation), maps, seenLocalRefs);
    }
    if (op === "edge.upsert") {
      const localRef = readOptionalString(operation, "localRef");
      if (localRef) {
        claimLocalRef(localRef, seenLocalRefs);
        maps.edges.set(localRef, readOptionalString(operation, "edgeId") ?? readOptionalString(operation, "id") ?? `edge_${slugify(readOptionalString(operation, "trigger") ?? localRef, "edge")}_${shortHash(localRef, 6)}`);
      }
    }
  }
  return maps;
}

function buildOperations(flow: ProductFlow, operation: Record<string, unknown>, maps: ChangeMaps): FlowOperation[] {
  const op = requireString(operation, "op");
  if (op === "root.update") {
    return [{ type: "project.update", patch: {
      title: readOptionalString(operation, "title"),
      summary: readOptionalString(operation, "summary"),
      goal: readOptionalString(operation, "goal")
    } }];
  }
  if (op === "root.move") {
    return [{ type: "project.move", x: requiredNumber(operation, "x"), y: requiredNumber(operation, "y") }];
  }
  if (op === "taxonomy.upsert") {
    const kind = requireTaxonomyKind(operation);
    const localRef = readOptionalString(operation, "localRef");
    const item = resolveTaxonomyItem(kind, { ...asRecord(operation.item), ...withoutControlFields(operation) }, maps);
    const id = resolveTaxonomyId(kind, readOptionalString(operation, "id") ?? localRef, maps);
    return [{ type: "taxonomy.upsert", kind, id, item }];
  }
  if (op === "taxonomy.remove") {
    const kind = requireTaxonomyKind(operation);
    return [{ type: "taxonomy.remove", kind, id: resolveRef(requireString(operation, "id"), taxonomyMap(maps, kind)) }];
  }
  if (op === "appSurface.move") {
    return [{
      type: "appSurface.move",
      appId: resolveRef(requireStringFrom(operation, ["appId", "id", "appRef"]), maps.appSurfaces),
      x: requiredNumber(operation, "x"),
      y: requiredNumber(operation, "y")
    }];
  }
  if (op === "node.upsert") {
    const payload = prepareNodePayload(operation, maps);
    return nodeUpsertOperations(flow, payload);
  }
  if (op === "node.move") {
    return [{
      type: "node.move",
      nodeId: resolveRef(requireStringFrom(operation, ["nodeId", "id", "nodeRef"]), maps.nodes),
      x: requiredNumber(operation, "x"),
      y: requiredNumber(operation, "y")
    }];
  }
  if (op === "node.remove") {
    return [{ type: "node.remove", nodeId: resolveRef(requireStringFrom(operation, ["nodeId", "id", "nodeRef"]), maps.nodes) }];
  }
  if (op === "edge.upsert") {
    const edgeRef = readOptionalString(operation, "localRef");
    const edgeIdValue = readOptionalString(operation, "edgeId") ?? readOptionalString(operation, "id") ?? edgeRef;
    const edgeId = edgeIdValue ? resolveRef(edgeIdValue, maps.edges) : undefined;
    const existing = edgeId ? flow.edges.find((edge) => edge.edgeId === edgeId) : undefined;
    const from = resolveChangesetEndpoint(operation.from, maps) ?? existing?.from;
    const type = readMcpEdgeType(operation, existing?.type);
    return [{ type: "edge.upsert", input: stripUndefined({
      edgeId,
      from,
      to: resolveChangesetEndpoint(operation.to, maps),
      trigger: readOptionalString(operation, "trigger") ?? readOptionalString(operation, "action"),
      action: readOptionalString(operation, "action"),
      type,
      condition: readOptionalString(operation, "condition")
    }) }];
  }
  if (op === "edge.update") {
    const edgeId = resolveRef(requireStringFrom(operation, ["edgeId", "id", "edgeRef"]), maps.edges);
    const existing = flow.edges.find((edge) => edge.edgeId === edgeId);
    if (!existing) {
      throw new Error(`Unknown edge: ${edgeId}`);
    }
    return [{ type: "edge.update", edgeId, patch: stripUndefined({
      from: operation.from === undefined ? undefined : resolveChangesetEndpoint(operation.from, maps),
      to: operation.to === undefined ? undefined : resolveChangesetEndpoint(operation.to, maps),
      trigger: typeof operation.trigger === "string" ? operation.trigger.trim() : undefined,
      action: typeof operation.action === "string" ? operation.action.trim() : undefined,
      type: operation.type === undefined ? undefined : readMcpEdgeType(operation, existing.type),
      condition: typeof operation.condition === "string" ? operation.condition.trim() : undefined
    }) }];
  }
  if (op === "edge.remove") {
    return [{ type: "edge.remove", edgeId: resolveRef(requireStringFrom(operation, ["edgeId", "id", "edgeRef"]), maps.edges) }];
  }
  throw new Error(`Unsupported canvas changeset operation: ${op}`);
}

function prepareNodePayload(operation: Record<string, unknown>, maps: ChangeMaps): Record<string, unknown> {
  const payload = { ...nodePayload(operation) };
  const localRef = readOptionalString(operation, "localRef");
  const requestedId = readOptionalString(operation, "nodeId") ?? readOptionalString(operation, "id") ?? (localRef ? maps.nodes.get(localRef) : undefined);
  const featureGroups = prepareFeatureGroups(payload.featureGroups, maps);
  return stripUndefined({
    ...payload,
    nodeId: requestedId,
    pageType: payload.pageType,
    appSurfaceIds: resolveArray(payload.appSurfaceIds, maps.appSurfaces),
    domainIds: resolveArray(payload.domainIds, maps.domains),
    roleIds: resolveArray(payload.roleIds, maps.roles),
    permissions: resolveArray(payload.permissions, maps.roles),
    statusGroupId: resolveOptionalRef(payload.statusGroupId, maps.statusGroups),
    featureGroups
  });
}

function prepareFeatureGroups(value: unknown, maps: ChangeMaps): FeatureGroup[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(isRecord).map((group) => {
    const groupRef = readOptionalString(group, "localRef");
    const groupId = readOptionalString(group, "groupId") ?? (groupRef ? maps.featureGroups.get(groupRef) : undefined);
    return {
      groupId: groupId!,
      name: readOptionalString(group, "name") ?? "功能分组",
      type: readOptionalString(group, "type") ?? "section",
      description: typeof group.description === "string" ? group.description : "",
      items: readRecords(group.items).map((item) => {
        const itemRef = readOptionalString(item, "localRef");
        return {
          itemId: readOptionalString(item, "itemId") ?? (itemRef ? maps.featureItems.get(itemRef) : undefined)!,
          name: readOptionalString(item, "name") ?? "功能项",
          type: readOptionalString(item, "type") ?? "text",
          description: typeof item.description === "string" ? item.description : "",
          dataBinding: readOptionalString(item, "dataBinding"),
          required: typeof item.required === "boolean" ? item.required : undefined
        };
      }),
      actions: readRecords(group.actions).map((action, index) => ({
        actionId: readOptionalString(action, "actionId") ?? `act_${shortHash(`${groupId}:${index}:${readOptionalString(action, "label") ?? "action"}`, 10)}`,
        label: readOptionalString(action, "label") ?? "操作",
        type: readOptionalString(action, "type") ?? "user",
        targetNodeId: resolveOptionalRef(action.targetNodeId, maps.nodes),
        preconditions: readOptionalStringArray(action, "preconditions"),
        result: readOptionalString(action, "result")
      }))
    };
  });
}

function resolveChangesetEndpoint(value: unknown, maps: ChangeMaps): FlowEndpoint | undefined {
  if (!isRecord(value)) {
    return readEndpoint(value, maps);
  }
  const normalized = { ...value };
  const nodeRef = readOptionalString(value, "nodeRef");
  const appRef = readOptionalString(value, "appRef");
  const groupRef = readOptionalString(value, "groupRef");
  const itemRef = readOptionalString(value, "itemRef");
  if (nodeRef) normalized.nodeId = resolveRef(nodeRef, maps.nodes);
  if (appRef) normalized.appId = resolveRef(appRef, maps.appSurfaces);
  if (groupRef) normalized.groupId = resolveRef(groupRef, maps.featureGroups);
  if (itemRef) normalized.itemId = resolveRef(itemRef, maps.featureItems);
  return readEndpoint(normalized, maps);
}

function scanFeatureRefs(payload: Record<string, unknown>, maps: ChangeMaps, seen: Set<string>): void {
  for (const [groupIndex, group] of readRecords(payload.featureGroups).entries()) {
    const groupRef = readOptionalString(group, "localRef");
    const groupName = readOptionalString(group, "name") ?? `group-${groupIndex}`;
    if (groupRef) {
      claimLocalRef(groupRef, seen);
      maps.featureGroups.set(groupRef, readOptionalString(group, "groupId") ?? `group_${slugify(groupName, "group")}_${shortHash(groupRef, 6)}`);
    }
    for (const [itemIndex, item] of readRecords(group.items).entries()) {
      const itemRef = readOptionalString(item, "localRef");
      const itemName = readOptionalString(item, "name") ?? `item-${itemIndex}`;
      if (itemRef) {
        claimLocalRef(itemRef, seen);
        maps.featureItems.set(itemRef, readOptionalString(item, "itemId") ?? `item_${slugify(itemName, "item")}_${shortHash(itemRef, 6)}`);
      }
    }
  }
}

function nodePayload(operation: Record<string, unknown>): Record<string, unknown> {
  return { ...asRecord(operation.item), ...withoutControlFields(operation) };
}

function withoutControlFields(operation: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(operation).filter(([key]) => !["op", "kind", "localRef", "id", "nodeId", "edgeId", "item"].includes(key)));
}

function resolveTaxonomyItem(kind: string, item: Record<string, unknown>, maps: ChangeMaps): Record<string, unknown> {
  if (kind === "role") {
    return { ...item, domainIds: resolveArray(item.domainIds, maps.domains) };
  }
  if (kind === "appSurface") {
    return { ...item, domainIds: resolveArray(item.domainIds, maps.domains), roleIds: resolveArray(item.roleIds, maps.roles) };
  }
  return item;
}

function summarize(flow: ProductFlow): Record<string, unknown> {
  const edgeTypes = Object.fromEntries(["interaction", "autoNavigate", "dataFlow", "statusChange", "nestedRelation"].map((type) => [type, flow.edges.filter((edge) => edge.status !== "removed" && edge.type === type).length]));
  const sourceKinds = Object.fromEntries(["projectOverview", "appSurface", "node", "featureGroup", "featureItem"].map((kind) => [kind, flow.edges.filter((edge) => edge.status !== "removed" && edge.from.kind === kind).length]));
  return {
    nodes: flow.nodes.filter((node) => node.status !== "removed").length,
    edges: flow.edges.filter((edge) => edge.status !== "removed").length,
    edgeTypes,
    sourceKinds,
    edgeDetails: flow.edges.filter((edge) => edge.status !== "removed").map((edge) => ({
      edgeId: edge.edgeId,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      trigger: edge.trigger
    }))
  };
}

function enforceBatchBounds(operations: Record<string, unknown>[]): void {
  if (operations.length > 200) throw new Error("A canvas changeset may contain at most 200 operations.");
  const nodeCount = operations.filter((operation) => operation.op === "node.upsert").length;
  const edgeCount = operations.filter((operation) => operation.op === "edge.upsert").length;
  if (nodeCount > 40) throw new Error("A canvas changeset may upsert at most 40 nodes.");
  if (edgeCount > 80) throw new Error("A canvas changeset may upsert at most 80 edges.");
}

function operationWeight(operation: Record<string, unknown>): number {
  const op = readOptionalString(operation, "op") ?? "";
  if (op === "root.update" || op === "root.move" || op === "taxonomy.upsert") return 10;
  if (op === "appSurface.move") return 20;
  if (op === "node.upsert" || op === "node.move") return 30;
  if (op === "edge.upsert") return 40;
  return 50;
}

function publicIdMap(maps: ChangeMaps): Record<string, Record<string, string>> {
  return {
    appSurfaces: nonIdentityEntries(maps.appSurfaces),
    domains: nonIdentityEntries(maps.domains),
    roles: nonIdentityEntries(maps.roles),
    statusGroups: nonIdentityEntries(maps.statusGroups),
    nodes: nonIdentityEntries(maps.nodes),
    featureGroups: nonIdentityEntries(maps.featureGroups),
    featureItems: nonIdentityEntries(maps.featureItems),
    edges: nonIdentityEntries(maps.edges)
  };
}

function nonIdentityEntries(map: Map<string, string>): Record<string, string> {
  return Object.fromEntries([...map].filter(([key, value]) => key !== value));
}

function identityMap(ids: string[]): Map<string, string> {
  return new Map(ids.map((id) => [id, id]));
}

function claimLocalRef(value: string, seen: Set<string>): void {
  if (seen.has(value)) throw new Error(`Duplicate changeset localRef: ${value}`);
  seen.add(value);
}

function generatedTaxonomyId(kind: string, localRef: string): string {
  const prefix = kind === "appSurface" ? "app" : kind === "statusGroup" ? "status" : kind;
  return `${prefix}_${slugify(localRef, prefix)}_${shortHash(localRef, 6)}`;
}

function taxonomyMap(maps: ChangeMaps, kind: string): Map<string, string> {
  if (kind === "domain") return maps.domains;
  if (kind === "role") return maps.roles;
  if (kind === "appSurface") return maps.appSurfaces;
  if (kind === "statusGroup") return maps.statusGroups;
  throw new Error(`Unsupported taxonomy kind: ${kind}`);
}

function requireTaxonomyKind(operation: Record<string, unknown>): "domain" | "role" | "appSurface" | "statusGroup" {
  const kind = requireString(operation, "kind");
  taxonomyMap({} as ChangeMaps, kind);
  return kind as "domain" | "role" | "appSurface" | "statusGroup";
}

function resolveTaxonomyId(kind: string, value: string | undefined, maps: ChangeMaps): string | undefined {
  return value ? resolveRef(value, taxonomyMap(maps, kind)) : undefined;
}

function resolveArray(value: unknown, map: Map<string, string>): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => resolveRef(item, map)) : undefined;
}

function resolveOptionalRef(value: unknown, map: Map<string, string>): string | undefined {
  return typeof value === "string" && value.trim() ? resolveRef(value.trim(), map) : undefined;
}

function resolveRef(value: string, map: Map<string, string>): string {
  return map.get(value) ?? value;
}

function readExpectedRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error("expectedRevision must be a positive integer.");
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = readOptionalNumber(record, key);
  if (value === undefined) throw new Error(`Missing finite number field: ${key}`);
  return value;
}

function requireStringFrom(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = readOptionalString(record, key);
    if (value) return value;
  }
  throw new Error(`Missing required string field: ${keys.join(" or ")}`);
}
