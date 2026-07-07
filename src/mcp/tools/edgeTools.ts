import { requireStringEither } from "./readers";
import { readUpsertEdgeInput } from "./toolInputReaders";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createEdgeToolActions(
  runner: McpFlowEditRunner
): Pick<McpToolActions, "upsertEdge" | "removeEdge"> {
  return {
    upsertEdge: (input) => runner.editFlow(input, (flow) => ({
      operations: [{ type: "edge.upsert", input: readUpsertEdgeInput(input, flow) }]
    })),
    removeEdge: (input) => runner.editFlow(input, () => ({
      operations: [{ type: "edge.remove", edgeId: requireStringEither(input, ["edgeId", "id"]) }]
    }))
  };
}
