import { normalizeFlowSelection } from "../../../product-flow/domain/selection";
import { validateProductFlow, type ProductFlow } from "../../../product-flow/domain";
import type { MindFlowEditorBridge } from "../protocol/bridge";
import { snapshotToPayload } from "./payloads";
import { validateMcpAuthoring } from "./authoringValidation";
import { readOptionalBoolean, readOptionalString, readStringPatch, requireString } from "./readers";
import { capabilitiesPayload, readRequiredPosition, schemaPayload } from "./toolInputReaders";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createEditorToolActions(
  bridge: MindFlowEditorBridge,
  runner: McpFlowEditRunner
): Pick<McpToolActions, "createFlow" | "openFlow" | "validateFlow" | "getEditorState" | "getOpenEditors" | "updateRoot" | "moveRoot"> {
  return {
    createFlow: async (input) => {
      if (!bridge.createFlow) {
        throw new Error("This MindFlow bridge cannot create an editor.");
      }
      const snapshot = await bridge.createFlow(readOptionalString(input, "title"));
      return { editor: snapshotToPayload(snapshot), counts: flowCounts(snapshot.flow) };
    },
    openFlow: async (input) => {
      if (!bridge.openFlow) {
        throw new Error("This MindFlow bridge cannot open an editor.");
      }
      const snapshot = await bridge.openFlow(requireString(input, "flowPath"));
      return { editor: snapshotToPayload(snapshot), counts: flowCounts(snapshot.flow) };
    },
    validateFlow: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      return { editor: snapshotToPayload(snapshot), ...validateMcpAuthoring(snapshot.flow, validateProductFlow(snapshot.flow)), counts: flowCounts(snapshot.flow) };
    },
    getEditorState: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      return {
        editor: snapshotToPayload(snapshot),
        ...(readOptionalBoolean(input, "includeFlow") === true ? { flow: snapshot.flow } : {}),
        counts: flowCounts(snapshot.flow),
        selection: normalizeFlowSelection(snapshot.selection),
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

function flowCounts(flow: ProductFlow): Record<string, number> {
  return {
    appSurfaces: flow.appSurfaces.length,
    domains: flow.domains.length,
    roles: flow.roles.length,
    statusGroups: flow.statusGroups.length,
    nodes: flow.nodes.filter((node) => node.status !== "removed").length,
    featureGroups: flow.nodes.reduce((count, node) => count + node.featureGroups.length, 0),
    featureItems: flow.nodes.reduce((count, node) => count + node.featureGroups.reduce((sum, group) => sum + group.items.length, 0), 0),
    edges: flow.edges.filter((edge) => edge.status !== "removed").length
  };
}
