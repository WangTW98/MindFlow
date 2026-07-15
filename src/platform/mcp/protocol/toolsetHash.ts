import { createHash } from "node:crypto";
import { MINDFLOW_MCP_TOOLS } from "./toolSchemas";

export function mindflowToolsetHash(): string {
  return createHash("sha256").update(JSON.stringify(MINDFLOW_MCP_TOOLS)).digest("hex");
}
