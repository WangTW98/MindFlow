import { readOptionalString, requireStringEither } from "./readers";
import { readUpsertEdgeInput } from "./toolInputReaders";
import { assertMcpEdgeSource } from "./authoringValidation";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createEdgeToolActions(
  runner: McpFlowEditRunner
): Pick<McpToolActions, "upsertEdge" | "removeEdge"> {
  return {
    upsertEdge: (input) => runner.editFlow(input, (flow) => {
      const edge = readUpsertEdgeInput(input, flow);
      const existing = edge.edgeId ? flow.edges.find((item) => item.edgeId === edge.edgeId) : undefined;
      assertMcpEdgeSource(edge.from ?? existing?.from, edge.type ?? existing?.type ?? "interaction", readOptionalString(input, "cardOutletReason"));
      return { operations: [{ type: "edge.upsert", input: edge }] };
    }),
    removeEdge: (input) => runner.editFlow(input, () => ({
      operations: [{ type: "edge.remove", edgeId: requireStringEither(input, ["edgeId", "id"]) }]
    }))
  };
}
