import type { McpToolActions, McpToolEntry } from "../registry";

export function editorToolEntries(actions: McpToolActions): McpToolEntry[] {
  return [
    ["mindflow_create_flow", actions.createFlow],
    ["mindflow_open_flow", actions.openFlow],
    ["mindflow_validate_flow", actions.validateFlow],
    ["mindflow_query_entities", actions.queryEntities],
    ["mindflow_get_subgraph", actions.getSubgraph],
    ["mindflow_trace_paths", actions.tracePaths],
    ["mindflow_apply_canvas_changes", actions.applyCanvasChanges],
    ["mindflow_get_editor_state", actions.getEditorState],
    ["mindflow_get_open_editors", actions.getOpenEditors],
    ["mindflow_get_selection", actions.getSelection],
    ["mindflow_set_selection", actions.setSelection],
    ["mindflow_clear_selection", actions.clearSelection],
    ["mindflow_preview_auto_layout", actions.previewAutoLayout],
    ["mindflow_apply_auto_layout", actions.applyAutoLayout],
    ["mindflow_reveal_entities", actions.revealEntities],
    ["mindflow_update_root", actions.updateRoot],
    ["mindflow_move_root", actions.moveRoot]
  ];
}
