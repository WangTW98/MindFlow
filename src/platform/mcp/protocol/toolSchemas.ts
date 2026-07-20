import { APP_SURFACE_TYPES, EDGE_TYPES, ENTITY_STATUSES, FLOW_ENDPOINT_KINDS, NODE_PAGE_TYPES } from "../../../product-flow/domain";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
}

const nodePageTypes = [...NODE_PAGE_TYPES];

const flowUriProperty = {
  flowUri: { type: "string", description: "Optional editor URI/path. Defaults to the active MindFlow editor." },
  includeFlow: { type: "boolean", description: "Include the complete flow in the response. Defaults to false." }
};

const emptyInput = objectSchema({}, []);

const endpointSchema = {
  oneOf: [
    objectSchema({ kind: { type: "string", enum: ["root"] } }, ["kind"]),
    objectSchema({ kind: { type: "string", enum: ["projectOverview"] } }, ["kind"]),
    objectSchema({ kind: { type: "string", enum: ["appSurface"] }, appId: { type: "string" } }, ["kind", "appId"]),
    objectSchema({ kind: { type: "string", enum: ["node"] }, nodeId: { type: "string" } }, ["kind", "nodeId"]),
    objectSchema({ kind: { type: "string", enum: ["featureGroup"] }, nodeId: { type: "string" }, groupId: { type: "string" } }, ["kind", "nodeId", "groupId"]),
    objectSchema({ kind: { type: "string", enum: ["featureItem"] }, nodeId: { type: "string" }, groupId: { type: "string" }, itemId: { type: "string" } }, ["kind", "nodeId", "groupId", "itemId"])
  ]
};

const featureItemSchema = objectSchema({
  itemId: { type: "string" },
  name: { type: "string" },
  type: { type: "string" },
  description: { type: "string" },
  dataBinding: { type: "string" },
  required: { type: "boolean" }
}, ["name"]);

const actionSchema = objectSchema({
  actionId: { type: "string" },
  label: { type: "string" },
  type: { type: "string" },
  targetNodeId: { type: "string" },
  preconditions: stringArray(),
  result: { type: "string" }
}, ["label"]);

const featureGroupSchema = objectSchema({
  groupId: { type: "string" },
  name: { type: "string" },
  type: { type: "string" },
  description: { type: "string" },
  items: { type: "array", items: featureItemSchema },
  actions: { type: "array", items: actionSchema }
}, ["name"]);

const nodePatchProperties = {
  nodeId: { type: "string" },
  id: { type: "string" },
  title: { type: "string" },
  name: { type: "string" },
  pageType: { type: "string", enum: nodePageTypes },
  purpose: { type: "string" },
  description: { type: "string" },
  appSurfaceIds: stringArray(),
  statusGroupId: { type: "string" },
  domainIds: stringArray(),
  roleIds: stringArray(),
  permissions: stringArray(),
  inputs: stringArray(),
  outputs: stringArray(),
  featureGroups: { type: "array", items: featureGroupSchema },
  x: { type: "number" },
  y: { type: "number" }
};

const typedNodeProperties = {
  ...flowUriProperty,
  ...nodePatchProperties
};

const batchNodeItemProperties = {
  ...nodePatchProperties
};

const changesetOperationSchema = {
  type: "object",
  additionalProperties: true,
  required: ["op"],
  properties: {
    op: {
      type: "string",
      enum: [
        "root.update", "root.move", "taxonomy.upsert", "taxonomy.remove", "appSurface.move",
        "node.upsert", "node.move", "node.remove", "edge.upsert", "edge.update", "edge.remove"
      ]
    },
    kind: { type: "string", enum: ["domain", "role", "appSurface", "statusGroup"] },
    localRef: { type: "string", minLength: 1 },
    id: { type: "string" },
    nodeId: { type: "string" },
    nodeRef: { type: "string" },
    appId: { type: "string" },
    appRef: { type: "string" },
    edgeId: { type: "string" },
    edgeRef: { type: "string" },
    title: { type: "string" },
    name: { type: "string" },
    pageType: { type: "string", enum: nodePageTypes },
    statusGroupId: { type: "string" },
    type: { type: "string", enum: [...EDGE_TYPES, ...APP_SURFACE_TYPES] },
    trigger: { type: "string" },
    action: { type: "string" },
    condition: { type: "string" },
    cardOutletReason: { type: "string", minLength: 1 },
    x: { type: "number" },
    y: { type: "number" },
    from: changesetEndpointSchema(),
    to: changesetEndpointSchema(),
    featureGroups: { type: "array", items: changesetFeatureGroupSchema() },
    item: { type: "object", additionalProperties: true }
  }
};

export const MINDFLOW_MCP_TOOLS: McpToolDefinition[] = [
  tool("mindflow_create_flow", "Create and open a new unsaved MindFlow canvas. The user must save it in VS Code.", objectSchema({
    title: { type: "string" }
  })),
  tool("mindflow_open_flow", "Open a current-format .mindflow file at any absolute local filesystem path.", objectSchema({
    flowPath: { type: "string", description: "Absolute local path to a .mindflow file. Relative paths and virtual/remote URIs are not supported." }
  }, ["flowPath"])),
  tool("mindflow_validate_flow", "Validate an open MindFlow canvas and return structural errors, warnings, and entity counts.", objectSchema({
    ...flowUriProperty
  })),
  tool("mindflow_query_entities", "Page through root, app surfaces, taxonomy, nodes, feature groups, feature items, or edges.", objectSchema({
    ...flowUriProperty,
    expectedRevision: { type: "integer", minimum: 1 },
    entityKind: { type: "string", enum: ["root", "appSurface", "domain", "role", "statusGroup", "node", "featureGroup", "featureItem", "edge"] },
    cursor: { type: "string" },
    limit: { type: "number" },
    ids: stringArray(),
    pageTypes: { type: "array", items: { type: "string", enum: nodePageTypes } },
    appSurfaceIds: stringArray(),
    domainIds: stringArray(),
    roleIds: stringArray(),
    statusGroupIds: stringArray(),
    statuses: { type: "array", items: { type: "string", enum: [...ENTITY_STATUSES] } },
    edgeTypes: { type: "array", items: { type: "string", enum: [...EDGE_TYPES] } },
    fromNodeIds: stringArray(),
    toNodeIds: stringArray(),
    text: { type: "string" },
    includeRemoved: { type: "boolean" }
  }, ["entityKind"])),
  tool("mindflow_get_subgraph", "Read a revision-pinned local graph neighborhood around root, application, or generic-node seeds.", objectSchema({
    ...flowUriProperty,
    expectedRevision: { type: "integer", minimum: 1 },
    nodeIds: stringArray(),
    appSurfaceIds: stringArray(),
    includeRoot: { type: "boolean" },
    direction: { type: "string", enum: ["incoming", "outgoing", "both"] },
    depth: { type: "integer", minimum: 1, maximum: 5 },
    edgeTypes: { type: "array", items: { type: "string", enum: [...EDGE_TYPES] } },
    includeRemoved: { type: "boolean" }
  })),
  tool("mindflow_trace_paths", "Trace bounded active directed paths between two root/application/node storage ids without interpreting product meaning.", objectSchema({
    ...flowUriProperty,
    expectedRevision: { type: "integer", minimum: 1 },
    fromId: { type: "string" },
    toId: { type: "string" },
    maxDepth: { type: "integer", minimum: 1, maximum: 12 },
    maxPaths: { type: "integer", minimum: 1, maximum: 50 },
    edgeTypes: { type: "array", items: { type: "string", enum: [...EDGE_TYPES] } }
  }, ["fromId", "toId"])),
  tool("mindflow_apply_canvas_changes", "Dry-run or atomically apply one bounded batch of cross-entity canvas changes with request-local references.", objectSchema({
    ...flowUriProperty,
    batchId: { type: "string", minLength: 1 },
    batchLabel: { type: "string", minLength: 1 },
    expectedRevision: { type: "integer", minimum: 1 },
    dryRun: { type: "boolean" },
    operations: { type: "array", minItems: 1, maxItems: 200, items: changesetOperationSchema },
    selection: { type: "object" }
  }, ["expectedRevision", "dryRun", "operations"])),
  tool("mindflow_get_editor_state", "Read compact editor metadata, counts, complete selection, schema enums, and capabilities. Set includeFlow=true for the complete flow.", objectSchema({
    ...flowUriProperty
  })),
  tool("mindflow_get_open_editors", "List open MindFlow editor tabs with active, dirty, URI, path, revision, and title metadata.", emptyInput),
  tool("mindflow_get_selection", "Read the complete MindFlow selection state and hydrated selected entities.", objectSchema({
    ...flowUriProperty
  })),
  tool("mindflow_set_selection", "Set the active MindFlow editor selection state.", objectSchema({
    ...flowUriProperty,
    selectedProjectOverview: { type: "boolean" },
    selectedNodeId: { type: "string" },
    selectedNodeIds: stringArray(),
    selectedEdgeId: { type: "string" },
    selectedAppSurfaceId: { type: "string" },
    selectedDomainId: { type: "string" },
    selectedRoleId: { type: "string" },
    selectedStatusGroupId: { type: "string" }
  })),
  tool("mindflow_clear_selection", "Clear all MindFlow selection state in the active editor.", objectSchema({
    ...flowUriProperty
  })),
  tool("mindflow_preview_auto_layout", "Compute the same DOM-measured auto layout as the open canvas without changing the document.", objectSchema({
    ...flowUriProperty,
    expectedRevision: { type: "integer", minimum: 1 }
  })),
  tool("mindflow_apply_auto_layout", "Dry-run or atomically apply the current DOM-measured canvas auto layout.", objectSchema({
    ...flowUriProperty,
    expectedRevision: { type: "integer", minimum: 1 },
    dryRun: { type: "boolean" }
  }, ["expectedRevision", "dryRun"])),
  tool("mindflow_reveal_entities", "Focus and temporarily highlight one or more canvas cards without changing document or selection state.", objectSchema({
    ...flowUriProperty,
    expectedRevision: { type: "integer", minimum: 1 },
    animate: { type: "boolean" },
    targets: {
      type: "array", minItems: 1, maxItems: 100,
      items: objectSchema({
        kind: { type: "string", enum: ["projectOverview", "appSurface", "node"] },
        id: { type: "string" }
      }, ["kind", "id"])
    }
  }, ["targets"])),
  tool("mindflow_update_root", "Update root project title, overview summary, and goal.", objectSchema({
    ...flowUriProperty,
    title: { type: "string" },
    summary: { type: "string" },
    goal: { type: "string" }
  })),
  tool("mindflow_move_root", "Move the root project overview card.", positionSchema()),
  tool("mindflow_upsert_app_surface", "Create or update an app surface card.", objectSchema({
    ...flowUriProperty,
    appId: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    type: { type: "string", enum: [...APP_SURFACE_TYPES] },
    description: { type: "string" },
    domainIds: stringArray(),
    roleIds: stringArray()
  })),
  tool("mindflow_remove_app_surface", "Remove an app surface and clean references.", idSchema(["appId", "id"])),
  tool("mindflow_move_app_surface", "Move an app surface card.", positionSchema({ appId: { type: "string" }, id: { type: "string" } })),
  tool("mindflow_upsert_domain", "Create or update a business domain.", objectSchema({
    ...flowUriProperty,
    domainId: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" }
  })),
  tool("mindflow_remove_domain", "Remove a business domain and clean references.", idSchema(["domainId", "id"])),
  tool("mindflow_upsert_role", "Create or update a user role.", objectSchema({
    ...flowUriProperty,
    roleId: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    domainIds: stringArray()
  })),
  tool("mindflow_remove_role", "Remove a user role and clean references.", idSchema(["roleId", "id"])),
  tool("mindflow_upsert_status_group", "Create or update a status group.", objectSchema({
    ...flowUriProperty,
    statusGroupId: { type: "string" },
    id: { type: "string" },
    title: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }
  })),
  tool("mindflow_remove_status_group", "Remove a status group and clear node references.", idSchema(["statusGroupId", "id"])),
  tool("mindflow_upsert_node", "Create or update a generic layout, navigation, page, popup, or component node. pageType is required.", objectSchema(typedNodeProperties, ["pageType"])),
  tool("mindflow_duplicate_nodes", "Duplicate active generic nodes at a target canvas coordinate using the same semantics as manual paste.", objectSchema({
    ...flowUriProperty,
    nodeIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } },
    primaryNodeId: { type: "string" },
    x: { type: "number" },
    y: { type: "number" }
  }, ["nodeIds", "x", "y"])),
  tool("mindflow_create_connected_node", "Atomically create one generic node and connect an existing endpoint to it.", objectSchema({
    ...typedNodeProperties,
    from: endpointSchema,
    to: endpointSchema,
    trigger: { type: "string" },
    action: { type: "string" },
    type: { type: "string", enum: [...EDGE_TYPES] },
    cardOutletReason: { type: "string", minLength: 1 }
  }, ["pageType", "type"], [{ required: ["from"] }, { required: ["to"] }])),
  tool("mindflow_update_node", "Update an existing node card.", identifiedObjectSchema(typedNodeProperties, ["nodeId", "id"])),
  tool("mindflow_move_node", "Move a node card.", positionSchema({ nodeId: { type: "string" }, id: { type: "string" } })),
  tool("mindflow_remove_node", "Soft-remove a node and its active incident edges.", idSchema(["nodeId", "id"])),
  tool("mindflow_upsert_edge", "Create or update an edge between explicit endpoints.", objectSchema({
    ...flowUriProperty,
    edgeId: { type: "string" },
    id: { type: "string" },
    from: endpointSchema,
    to: endpointSchema,
    trigger: { type: "string" },
    action: { type: "string" },
    type: { type: "string", enum: [...EDGE_TYPES] },
    condition: { type: "string" },
    cardOutletReason: { type: "string", minLength: 1 }
  }, ["type"], [{ required: ["edgeId"] }, { required: ["id"] }, { required: ["from", "to"] }])),
  tool("mindflow_update_edge", "Partially update an existing edge without resending unchanged fields.", objectSchema({
    ...flowUriProperty,
    edgeId: { type: "string" },
    id: { type: "string" },
    from: endpointSchema,
    to: endpointSchema,
    trigger: { type: "string" },
    action: { type: "string" },
    type: { type: "string", enum: [...EDGE_TYPES] },
    condition: { type: "string" }
  }, [], [{ required: ["edgeId"] }, { required: ["id"] }])),
  tool("mindflow_remove_edge", "Soft-remove an edge.", idSchema(["edgeId", "id"])),
  tool("mindflow_batch_get_nodes", "Query nodes by ids, page types, app surfaces, domains, roles, status, or current selection.", objectSchema({
    ...flowUriProperty,
    nodeIds: stringArray(),
    pageTypes: stringArray(),
    appSurfaceIds: stringArray(),
    domainIds: stringArray(),
    roleIds: stringArray(),
    status: { type: "string", enum: [...ENTITY_STATUSES] },
    statuses: { type: "array", items: { type: "string", enum: [...ENTITY_STATUSES] } },
    selection: { type: "boolean" },
    includeIncidentEdges: { type: "boolean" }
  })),
  tool("mindflow_batch_upsert_nodes", "Atomically create or update multiple generic nodes. Each item must include pageType.", batchNodesSchema(batchNodeItemProperties, ["pageType"])),
  tool("mindflow_batch_update_nodes", "Atomically update multiple existing nodes.", batchNodesSchema(nodePatchProperties)),
  tool("mindflow_batch_move_nodes", "Atomically move multiple existing nodes.", batchNodesSchema({
    nodeId: { type: "string" },
    id: { type: "string" },
    x: { type: "number" },
    y: { type: "number" }
  })),
  tool("mindflow_batch_remove_nodes", "Atomically soft-remove multiple nodes and their incident edges.", batchNodesSchema({
    nodeId: { type: "string" },
    id: { type: "string" }
  }))
];

function tool(name: string, description: string, inputSchema: Record<string, unknown>): McpToolDefinition {
  const readOnly = name.startsWith("mindflow_get_") || name === "mindflow_query_entities" || name === "mindflow_trace_paths" || name === "mindflow_preview_auto_layout" || name === "mindflow_reveal_entities" || name === "mindflow_validate_flow";
  const destructive = name.includes("remove") || name === "mindflow_apply_canvas_changes";
  const idempotent = readOnly || name.includes("move") || name.includes("update") || name.includes("validate") || name.includes("query");
  return {
    name,
    description,
    inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: idempotent }
  };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = [], anyOf: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(anyOf.length > 0 ? { anyOf } : {})
  };
}

function stringArray(): Record<string, unknown> {
  return { type: "array", maxItems: 200, items: { type: "string" } };
}

function changesetEndpointSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kind"],
    properties: {
      kind: { type: "string", enum: ["root", "projectOverview", "appSurface", "node", "featureGroup", "featureItem"] },
      nodeId: { type: "string" },
      nodeRef: { type: "string" },
      appId: { type: "string" },
      appRef: { type: "string" },
      groupId: { type: "string" },
      groupRef: { type: "string" },
      itemId: { type: "string" },
      itemRef: { type: "string" }
    }
  };
}

function changesetFeatureGroupSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      localRef: { type: "string", minLength: 1 },
      groupId: { type: "string" },
      name: { type: "string" },
      type: { type: "string" },
      description: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            localRef: { type: "string", minLength: 1 },
            itemId: { type: "string" },
            name: { type: "string" },
            type: { type: "string" },
            description: { type: "string" },
            dataBinding: { type: "string" },
            required: { type: "boolean" }
          }
        }
      },
      actions: { type: "array", items: actionSchema }
    }
  };
}

function idSchema(keys: string[]): Record<string, unknown> {
  return identifiedObjectSchema({
    ...flowUriProperty,
    ...Object.fromEntries(keys.map((key) => [key, { type: "string" }]))
  }, keys);
}

function positionSchema(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const properties = {
    ...flowUriProperty,
    ...extra,
    x: { type: "number" },
    y: { type: "number" }
  };
  const identifierKeys = Object.keys(extra);
  return objectSchema(properties, ["x", "y"], identifierKeys.length > 0 ? identifierKeys.map((key) => ({ required: [key] })) : []);
}

function batchNodesSchema(itemProperties: Record<string, unknown>, itemRequired: string[] = []): Record<string, unknown> {
  return objectSchema({
    ...flowUriProperty,
    dryRun: { type: "boolean" },
    nodes: { type: "array", minItems: 1, maxItems: 100, items: objectSchema(itemProperties, itemRequired) },
    items: { type: "array", minItems: 1, maxItems: 100, items: objectSchema(itemProperties, itemRequired) }
  }, [], [{ required: ["nodes"] }, { required: ["items"] }]);
}

function identifiedObjectSchema(properties: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return objectSchema(properties, [], keys.map((key) => ({ required: [key] })));
}
