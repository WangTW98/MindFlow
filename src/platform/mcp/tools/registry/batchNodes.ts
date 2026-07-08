import type { McpToolActions, McpToolEntry } from "../registry";

export function batchNodeToolEntries(actions: McpToolActions): McpToolEntry[] {
  return [
    ["mindflow_batch_get_nodes", actions.batchGetNodes],
    ["mindflow_batch_upsert_nodes", actions.batchUpsertNodes],
    ["mindflow_batch_update_nodes", actions.batchUpdateNodes],
    ["mindflow_batch_move_nodes", actions.batchMoveNodes],
    ["mindflow_batch_remove_nodes", actions.batchRemoveNodes]
  ];
}
