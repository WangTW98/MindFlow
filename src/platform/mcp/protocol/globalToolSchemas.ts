import { MINDFLOW_MCP_TOOLS, type McpToolDefinition } from "./toolSchemas";

export const MINDFLOW_MCP_CONTRACT_VERSION = 2;

export const MINDFLOW_HOST_SESSION_FIELDS = [
  "hostId", "displayName", "environment", "endpoint", "token", "pid", "createdAt", "lastSeenAt",
  "windowFocused", "lastFocusedAt", "extensionVersion", "contractVersion", "contractHash"
] as const;

export const MINDFLOW_GLOBAL_CONTRACT_DESCRIPTOR = {
  contractVersion: MINDFLOW_MCP_CONTRACT_VERSION,
  listHostsResult: ["hosts", "unavailable"],
  hostSummaryFields: ["hostId", "displayName", "focused", "lastFocusedAt", "openEditorCount", "extensionVersion"],
  editorHostFields: ["hostId", "hostName"],
  routingPriority: ["flowUri", "hostId", "recentFocusForReadOnly"],
  multiHostMutationTarget: "explicit",
  openFlowPath: "absolute-local-mindflow"
} as const;

const hostIdProperty = {
  hostId: {
    type: "string",
    description: "Active MindFlow VS Code host id. Optional for reads; mutating calls require hostId or flowUri when multiple hosts are active."
  }
};

export function mindflowGlobalToolDefinitions(): McpToolDefinition[] {
  return [
    {
      name: "mindflow_list_hosts",
      description: "List local VS Code Extension Hosts currently exposing MindFlow MCP sessions.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    ...MINDFLOW_MCP_TOOLS.map((definition) => {
      const schema = definition.inputSchema;
      const properties = isRecord(schema.properties) ? schema.properties : {};
      return { ...definition, inputSchema: { ...schema, properties: { ...properties, ...hostIdProperty } } };
    })
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
