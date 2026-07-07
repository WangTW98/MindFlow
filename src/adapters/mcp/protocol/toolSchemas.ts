import { APP_SURFACE_TYPES, EDGE_TYPES, ENTITY_STATUSES, FLOW_ENDPOINT_KINDS } from "../../../domain/product-flow";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const nodeKinds = ["layout", "navigation", "page", "popup", "component"];
const nodePageTypes = ["skeleton", "navigation", "page", "popup", "component"];

const flowUriProperty = { flowUri: { type: "string", description: "Optional editor URI/path. Defaults to the active MindFlow editor." } };

const emptyInput = objectSchema({}, []);

const endpointSchema = objectSchema({
  kind: { type: "string", enum: ["root", ...FLOW_ENDPOINT_KINDS] },
  nodeId: { type: "string" },
  id: { type: "string" },
  appId: { type: "string" },
  groupId: { type: "string" },
  itemId: { type: "string" }
}, ["kind"]);

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
  ...nodePatchProperties,
  kind: { type: "string", enum: nodeKinds }
};

export const MINDFLOW_MCP_TOOLS: McpToolDefinition[] = [
  tool("mindflow_get_editor_state", "Read the active MindFlow editor state, flow, complete selection state, hydrated selection entities, schema enums, and capabilities.", objectSchema({
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
  tool("mindflow_upsert_layout_node", "Create or update a layout node with pageType skeleton.", objectSchema(typedNodeProperties)),
  tool("mindflow_upsert_navigation_node", "Create or update a navigation node with pageType navigation.", objectSchema(typedNodeProperties)),
  tool("mindflow_upsert_page_node", "Create or update a page node with pageType page.", objectSchema(typedNodeProperties)),
  tool("mindflow_upsert_popup_node", "Create or update a popup node with pageType popup.", objectSchema(typedNodeProperties)),
  tool("mindflow_upsert_component_node", "Create or update a component node with pageType component.", objectSchema(typedNodeProperties)),
  tool("mindflow_update_node", "Update an existing node card.", objectSchema(typedNodeProperties, [])),
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
    edgeType: { type: "string", enum: [...EDGE_TYPES] },
    condition: { type: "string" },
    appSurfaceIds: stringArray(),
    domainIds: stringArray(),
    roleIds: stringArray()
  })),
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
  tool("mindflow_batch_upsert_nodes", "Atomically create or update multiple nodes. Each item must include kind.", batchNodesSchema(batchNodeItemProperties)),
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
  return { name, description, inputSchema };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {})
  };
}

function stringArray(): Record<string, unknown> {
  return { type: "array", items: { type: "string" } };
}

function idSchema(keys: string[]): Record<string, unknown> {
  return objectSchema({
    ...flowUriProperty,
    ...Object.fromEntries(keys.map((key) => [key, { type: "string" }]))
  });
}

function positionSchema(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return objectSchema({
    ...flowUriProperty,
    ...extra,
    x: { type: "number" },
    y: { type: "number" }
  }, ["x", "y"]);
}

function batchNodesSchema(itemProperties: Record<string, unknown>): Record<string, unknown> {
  return objectSchema({
    ...flowUriProperty,
    dryRun: { type: "boolean" },
    nodes: { type: "array", minItems: 1, items: objectSchema(itemProperties) },
    items: { type: "array", minItems: 1, items: objectSchema(itemProperties) }
  });
}
