import { createHash } from "node:crypto";
import { mindflowGlobalToolDefinitions, MINDFLOW_GLOBAL_CONTRACT_DESCRIPTOR, MINDFLOW_HOST_SESSION_FIELDS, MINDFLOW_MCP_CONTRACT_VERSION } from "./globalToolSchemas";
import { MINDFLOW_MCP_TOOLS } from "./toolSchemas";

export function mindflowMcpContractHash(): string {
  return createHash("sha256").update(JSON.stringify(mindflowMcpCompatibilityDescriptor())).digest("hex");
}

export function mindflowMcpCompatibilityDescriptor(): Record<string, unknown> {
  return {
    contractVersion: MINDFLOW_MCP_CONTRACT_VERSION,
    backendTools: MINDFLOW_MCP_TOOLS.map(wireToolDefinition),
    globalTools: mindflowGlobalToolDefinitions().map(wireToolDefinition),
    hostSessionFields: MINDFLOW_HOST_SESSION_FIELDS,
    globalContract: MINDFLOW_GLOBAL_CONTRACT_DESCRIPTOR
  };
}

function wireToolDefinition(tool: { name: string; inputSchema: Record<string, unknown> }): Record<string, unknown> {
  return { name: tool.name, inputSchema: stripSchemaMetadata(tool.inputSchema) };
}

function stripSchemaMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSchemaMetadata);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["description", "title", "examples", "$comment"].includes(key))
      .map(([key, nested]) => [key, stripSchemaMetadata(nested)])
  );
}
