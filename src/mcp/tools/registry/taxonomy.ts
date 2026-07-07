import type { McpToolActions, McpToolEntry } from "../registry";

export function taxonomyToolEntries(actions: McpToolActions): McpToolEntry[] {
  return [
    ["mindflow_upsert_app_surface", actions.upsertAppSurface],
    ["mindflow_remove_app_surface", actions.removeAppSurface],
    ["mindflow_move_app_surface", actions.moveAppSurface],
    ["mindflow_upsert_domain", actions.upsertDomain],
    ["mindflow_remove_domain", actions.removeDomain],
    ["mindflow_upsert_role", actions.upsertRole],
    ["mindflow_remove_role", actions.removeRole],
    ["mindflow_upsert_status_group", actions.upsertStatusGroup],
    ["mindflow_remove_status_group", actions.removeStatusGroup]
  ];
}
