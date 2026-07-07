import { normalizeFlowSelection } from "../../state/selection";
import type { MindFlowEditorBridge } from "../bridge";
import { buildHydratedSelection, buildSelectionIssues, snapshotToPayload } from "./payloads";
import { readOptionalString, readStringPatch } from "./readers";
import { capabilitiesPayload, readRequiredPosition, schemaPayload } from "./toolInputReaders";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createEditorToolActions(
  bridge: MindFlowEditorBridge,
  runner: McpFlowEditRunner
): Pick<McpToolActions, "getEditorState" | "getOpenEditors" | "updateRoot" | "moveRoot"> {
  return {
    getEditorState: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      return {
        editor: snapshotToPayload(snapshot),
        flow: snapshot.flow,
        selection: normalizeFlowSelection(snapshot.selection),
        hydratedSelection: buildHydratedSelection(snapshot),
        selectionIssues: buildSelectionIssues(snapshot),
        schema: schemaPayload(),
        capabilities: capabilitiesPayload()
      };
    },
    getOpenEditors: async () => {
      const editors = await bridge.getOpenEditors();
      return { editors: editors.map(snapshotToPayload) };
    },
    updateRoot: (input) => runner.editFlow(input, () => ({
      operations: [{
        type: "project.update",
        patch: {
          title: readOptionalString(input, "title"),
          summary: readOptionalString(input, "summary"),
          goal: readStringPatch(input, "goal")
        }
      }]
    })),
    moveRoot: (input) => runner.editFlow(input, () => ({
      operations: [{ type: "project.move", ...readRequiredPosition(input) }]
    }))
  };
}
