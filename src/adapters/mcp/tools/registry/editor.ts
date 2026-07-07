import type { McpToolActions, McpToolEntry } from "../registry";

export function editorToolEntries(actions: McpToolActions): McpToolEntry[] {
  return [
    ["mindflow_get_editor_state", actions.getEditorState],
    ["mindflow_get_active_flow", actions.getEditorState],
    ["mindflow_get_open_editors", actions.getOpenEditors],
    ["mindflow_get_open_flows", actions.getOpenEditors],
    ["mindflow_get_selection", actions.getSelection],
    ["mindflow_set_selection", actions.setSelection],
    ["mindflow_clear_selection", actions.clearSelection],
    ["mindflow_update_root", actions.updateRoot],
    ["mindflow_update_project", actions.updateRoot],
    ["mindflow_move_root", actions.moveRoot]
  ];
}
