import type { McpToolActions, McpToolEntry } from "../registry";

export function nodeToolEntries(actions: McpToolActions): McpToolEntry[] {
  return [
    ["mindflow_upsert_node", actions.upsertNode],
    ["mindflow_duplicate_nodes", actions.duplicateNodes],
    ["mindflow_create_connected_node", actions.createConnectedNode],
    ["mindflow_update_node", actions.updateNode],
    ["mindflow_move_node", actions.moveNode],
    ["mindflow_remove_node", actions.removeNode]
  ];
}
