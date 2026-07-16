import { createHash } from "node:crypto";
import { mindflowGlobalToolDefinitions, MINDFLOW_GLOBAL_CONTRACT_DESCRIPTOR, MINDFLOW_HOST_SESSION_FIELDS } from "./globalToolSchemas";
import { MINDFLOW_MCP_TOOLS } from "./toolSchemas";

export function mindflowMcpContractHash(): string {
  return createHash("sha256").update(JSON.stringify({
    backendTools: MINDFLOW_MCP_TOOLS,
    globalTools: mindflowGlobalToolDefinitions(),
    hostSessionFields: MINDFLOW_HOST_SESSION_FIELDS,
    globalContract: MINDFLOW_GLOBAL_CONTRACT_DESCRIPTOR
  })).digest("hex");
}
