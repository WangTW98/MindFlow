import type { McpToolActions, McpToolEntry } from "../registry";

export function edgeToolEntries(actions: McpToolActions): McpToolEntry[] {
  return [
    ["mindflow_upsert_edge", actions.upsertEdge],
    ["mindflow_remove_edge", actions.removeEdge]
  ];
}
