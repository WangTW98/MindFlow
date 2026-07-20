import { requireStringEither } from "./readers";
import { readUpsertEdgeInput } from "./toolInputReaders";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createEdgeToolActions(
  runner: McpFlowEditRunner
): Pick<McpToolActions, "upsertEdge" | "updateEdge" | "removeEdge"> {
  return {
    upsertEdge: (input) => runner.editFlow(input, (flow) => {
      const edge = readUpsertEdgeInput(input, flow);
      return { operations: [{ type: "edge.upsert", input: edge }] };
    }),
    updateEdge: (input) => runner.editFlow(input, (flow) => {
      const edgeId = requireStringEither(input, ["edgeId", "id"]);
      if (!flow.edges.some((edge) => edge.edgeId === edgeId)) {
        throw new Error(`Unknown edge: ${edgeId}`);
      }
      const patch = readUpsertEdgeInput({ ...input, edgeId }, flow);
      return { operations: [{ type: "edge.update", edgeId, patch }] };
    }),
    removeEdge: (input) => runner.editFlow(input, () => ({
      operations: [{ type: "edge.remove", edgeId: requireStringEither(input, ["edgeId", "id"]) }]
    }))
  };
}
