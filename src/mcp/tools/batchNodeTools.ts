import { normalizeFlowSelection } from "../../state/selection";
import type { FlowOperation } from "../../state/operations";
import type { MindFlowEditorBridge } from "../bridge";
import { batchSelectionPatch, resultNodes, snapshotToPayload } from "./payloads";
import { readOptionalBoolean, readOptionalString, readOptionalStringArray, requireStringEither, stripUndefined } from "./readers";
import { edgeTouchesAnyNode, nodeMatchesFilters, nodeUpsertOperations, readNodeDetailsPatch, readNodeKind, readRequiredPosition, readStatuses } from "./toolInputReaders";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createBatchNodeToolActions(
  bridge: MindFlowEditorBridge,
  runner: McpFlowEditRunner
): Pick<McpToolActions, "batchGetNodes" | "batchUpsertNodes" | "batchUpdateNodes" | "batchMoveNodes" | "batchRemoveNodes"> {
  return {
    batchGetNodes: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      const selectedNodeIds = normalizeFlowSelection(snapshot.selection).selectedNodeIds;
      const filters = {
        nodeIds: readOptionalStringArray(input, "nodeIds"),
        pageTypes: readOptionalStringArray(input, "pageTypes"),
        appSurfaceIds: readOptionalStringArray(input, "appSurfaceIds"),
        domainIds: readOptionalStringArray(input, "domainIds"),
        roleIds: readOptionalStringArray(input, "roleIds"),
        statuses: readStatuses(input),
        selection: readOptionalBoolean(input, "selection") === true,
        includeIncidentEdges: readOptionalBoolean(input, "includeIncidentEdges") === true
      };
      const nodes = snapshot.flow.nodes.filter((node) => nodeMatchesFilters(node, filters, selectedNodeIds));
      const nodeIds = new Set(nodes.map((node) => node.nodeId));
      return {
        editor: snapshotToPayload(snapshot),
        nodes,
        edges: filters.includeIncidentEdges ? snapshot.flow.edges.filter((edge) => edgeTouchesAnyNode(edge, nodeIds)) : undefined
      };
    },
    batchUpsertNodes: (input) => runner.batchEditNodes(input, (flow, items) => ({
      operations: items.flatMap((item) => nodeUpsertOperations(flow, item, readNodeKind(item))),
      result: (results) => ({ nodes: resultNodes(results) }),
      selection: (results) => batchSelectionPatch(resultNodes(results), true)
    })),
    batchUpdateNodes: (input) => runner.batchEditNodes(input, (_flow, items) => ({
      operations: items.map((item) => ({ type: "node.update", nodeId: requireStringEither(item, ["nodeId", "id"]), patch: stripUndefined(readNodeDetailsPatch(item)) })),
      result: (results) => ({ nodes: resultNodes(results) }),
      selection: (results) => batchSelectionPatch(resultNodes(results), true)
    })),
    batchMoveNodes: (input) => runner.batchEditNodes(input, (_flow, items) => ({
      operations: items.map((item) => {
        const position = readRequiredPosition(item);
        return { type: "node.move", nodeId: requireStringEither(item, ["nodeId", "id"]), x: position.x, y: position.y } satisfies FlowOperation;
      }),
      result: (results) => ({ nodes: resultNodes(results) }),
      selection: (results) => batchSelectionPatch(resultNodes(results), true)
    })),
    batchRemoveNodes: (input) => runner.batchEditNodes(input, (_flow, items) => ({
      operations: items.map((item) => ({ type: "node.remove", nodeId: requireStringEither(item, ["nodeId", "id"]) })),
      result: (results) => ({
        removedNodeIds: results.flatMap((result) => result.type === "node.remove" ? [result.removedNodeId] : []),
        removedEdgeIds: Array.from(new Set(results.flatMap((result) => result.type === "node.remove" ? result.removedEdgeIds : [])))
      })
    }))
  };
}
