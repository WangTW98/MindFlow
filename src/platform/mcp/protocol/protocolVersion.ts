export const MINDFLOW_SUPPORTED_MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2024-11-05"] as const;

export const MINDFLOW_LATEST_MCP_PROTOCOL_VERSION = MINDFLOW_SUPPORTED_MCP_PROTOCOL_VERSIONS[0];

export function negotiateMindFlowMcpProtocolVersion(requested: string): string {
  return (MINDFLOW_SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MINDFLOW_LATEST_MCP_PROTOCOL_VERSION;
}
