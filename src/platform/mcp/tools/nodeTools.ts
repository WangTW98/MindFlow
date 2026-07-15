import { readOptionalNumber, readOptionalString, requireStringEither, stripUndefined } from "./readers";
import { createIdMaps, nodeUpsertOperations, readEndpoint, readMcpEdgeType, readNodeDetailsPatch, readRequiredPosition } from "./toolInputReaders";
import { operationPayload, resultNodes } from "./payloads";
import { assertMcpEdgeSource, assertMcpNodeFeatureGroups } from "./authoringValidation";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createNodeToolActions(
  runner: McpFlowEditRunner
): Pick<McpToolActions, "upsertNode" | "createConnectedNode" | "updateNode" | "moveNode" | "removeNode"> {
  return {
    upsertNode: (input) => runner.editFlow(input, (flow) => ({
      operations: nodeUpsertOperations(flow, input),
      result: (results) => ({ node: resultNodes(results).at(-1) })
    })),
    createConnectedNode: (input) => runner.editFlow(input, (flow) => {
      const patch = readNodeDetailsPatch(input);
      if (!patch.pageType) {
        throw new Error("Connected node creation requires pageType.");
      }
      assertMcpNodeFeatureGroups(patch.featureGroups);
      const maps = createIdMaps(flow);
      const from = readEndpoint(input.from, maps);
      const type = readMcpEdgeType(input);
      assertMcpEdgeSource(from ?? { kind: "node", nodeId: "new-node" }, type, readOptionalString(input, "cardOutletReason"));
      return {
        operations: [{
          type: "node.createConnected",
          request: {
            input: {
              title: patch.title,
              pageType: patch.pageType,
              purpose: patch.purpose,
              featureGroups: patch.featureGroups,
              appSurfaceIds: patch.appSurfaceIds,
              domainIds: patch.domainIds,
              roleIds: patch.roleIds
            },
            detailPatch: stripUndefined(patch),
            from,
            to: readEndpoint(input.to, maps),
            x: readOptionalNumber(input, "x"),
            y: readOptionalNumber(input, "y"),
            trigger: readOptionalString(input, "trigger") ?? readOptionalString(input, "action"),
            type
          }
        }],
        result: (results) => ({ result: operationPayload(results[0]!) })
      };
    }),
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
