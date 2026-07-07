import { emptyFlowSelection, normalizeFlowSelection } from "../../../domain/product-flow/selection";
import type { MindFlowEditorBridge } from "../protocol/bridge";
import { buildHydratedSelection, buildSelectionIssues, snapshotToPayload } from "./payloads";
import { readOptionalString } from "./readers";
import { readSelectionPatch } from "./toolInputReaders";
import type { McpToolActions } from "./registry";

export function createSelectionToolActions(
  bridge: MindFlowEditorBridge
): Pick<McpToolActions, "getSelection" | "setSelection" | "clearSelection"> {
  return {
    getSelection: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      return {
        editor: snapshotToPayload(snapshot),
        selection: normalizeFlowSelection(snapshot.selection),
        hydratedSelection: buildHydratedSelection(snapshot),
        selectionIssues: buildSelectionIssues(snapshot)
      };
    },
    setSelection: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      const next = await bridge.setSelection(snapshot.uri, readSelectionPatch(input));
      return {
        editor: snapshotToPayload(next),
        selection: normalizeFlowSelection(next.selection),
        hydratedSelection: buildHydratedSelection(next),
        selectionIssues: buildSelectionIssues(next)
      };
    },
    clearSelection: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      const next = await bridge.setSelection(snapshot.uri, emptyFlowSelection());
      return {
        editor: snapshotToPayload(next),
        selection: normalizeFlowSelection(next.selection),
        hydratedSelection: buildHydratedSelection(next),
        selectionIssues: buildSelectionIssues(next)
      };
    }
  };
}
