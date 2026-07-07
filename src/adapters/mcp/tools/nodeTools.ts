import { requireStringEither, stripUndefined } from "./readers";
import { nodeUpsertOperations, readNodeDetailsPatch, readRequiredPosition } from "./toolInputReaders";
import { resultNodes } from "./payloads";
import type { McpNodeKind } from "./types";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createNodeToolActions(
  runner: McpFlowEditRunner
): Pick<McpToolActions, "upsertLayoutNode" | "upsertNavigationNode" | "upsertPageNode" | "upsertPopupNode" | "upsertComponentNode" | "updateNode" | "moveNode" | "removeNode"> {
  const upsertTypedNode = (input: Record<string, unknown>, kind: McpNodeKind) => runner.editFlow(input, (flow) => ({
    operations: nodeUpsertOperations(flow, input, kind),
    result: (results) => {
      const nodes = resultNodes(results);
      const node = nodes[nodes.length - 1];
      return { node, kind };
    }
  }));
  return {
    upsertLayoutNode: (input) => upsertTypedNode(input, "layout"),
    upsertNavigationNode: (input) => upsertTypedNode(input, "navigation"),
    upsertPageNode: (input) => upsertTypedNode(input, "page"),
    upsertPopupNode: (input) => upsertTypedNode(input, "popup"),
    upsertComponentNode: (input) => upsertTypedNode(input, "component"),
    updateNode: (input) => runner.editFlow(input, () => ({
      operations: [{ type: "node.update", nodeId: requireStringEither(input, ["nodeId", "id"]), patch: stripUndefined(readNodeDetailsPatch(input)) }]
    })),
    moveNode: (input) => runner.editFlow(input, () => {
      const position = readRequiredPosition(input);
      return {
        operations: [{ type: "node.move", nodeId: requireStringEither(input, ["nodeId", "id"]), x: position.x, y: position.y }]
      };
    }),
    removeNode: (input) => runner.editFlow(input, () => ({
      operations: [{ type: "node.remove", nodeId: requireStringEither(input, ["nodeId", "id"]) }]
    }))
  };
}
