import type { McpToolActions, McpToolEntry } from "../registry";

export function nodeToolEntries(actions: McpToolActions): McpToolEntry[] {
  return [
    ["mindflow_upsert_layout_node", actions.upsertLayoutNode],
    ["mindflow_upsert_navigation_node", actions.upsertNavigationNode],
    ["mindflow_upsert_page_node", actions.upsertPageNode],
    ["mindflow_upsert_node", actions.upsertPageNode],
    ["mindflow_upsert_popup_node", actions.upsertPopupNode],
    ["mindflow_upsert_component_node", actions.upsertComponentNode],
    ["mindflow_update_node", actions.updateNode],
    ["mindflow_move_node", actions.moveNode],
    ["mindflow_remove_node", actions.removeNode]
  ];
}
