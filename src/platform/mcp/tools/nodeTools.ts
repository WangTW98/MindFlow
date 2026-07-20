import { readOptionalNumber, readOptionalString, readOptionalStringArray, requireStringEither, stripUndefined } from "./readers";
import { createIdMaps, nodeUpsertOperations, readEndpoint, readMcpEdgeType, readNodeDetailsPatch, readRequiredPosition } from "./toolInputReaders";
import { operationPayload, resultNodes } from "./payloads";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createNodeToolActions(
  runner: McpFlowEditRunner
): Pick<McpToolActions, "upsertNode" | "duplicateNodes" | "createConnectedNode" | "updateNode" | "moveNode" | "removeNode"> {
  return {
    upsertNode: (input) => runner.editFlow(input, (flow) => ({
      operations: nodeUpsertOperations(flow, input),
      result: (results) => ({ node: resultNodes(results).at(-1) })
    })),
    duplicateNodes: (input) => runner.editFlow(input, (flow) => {
      const nodeIds = [...new Set(readOptionalStringArray(input, "nodeIds") ?? [])];
      const nodes = nodeIds.map((nodeId) => flow.nodes.find((node) => node.nodeId === nodeId && node.status !== "removed"));
      if (nodes.length === 0 || nodes.some((node) => !node)) {
        throw new Error("Duplicate nodes requires existing active nodeIds.");
      }
      const positions = nodes.map((node) => node!.view?.position);
      if (positions.some((position) => !position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) {
        throw new Error("Every duplicated node requires a finite canvas position.");
      }
      const x = readOptionalNumber(input, "x");
      const y = readOptionalNumber(input, "y");
      if (x === undefined || y === undefined) {
        throw new Error("Duplicate nodes requires finite x and y coordinates.");
      }
      const anchorX = Math.min(...positions.map((position) => position!.x));
      const anchorY = Math.min(...positions.map((position) => position!.y));
      const requestedPrimaryNodeId = readOptionalString(input, "primaryNodeId");
      if (requestedPrimaryNodeId && !nodeIds.includes(requestedPrimaryNodeId)) {
        throw new Error("primaryNodeId must be included in nodeIds.");
      }
      const primaryNodeId = requestedPrimaryNodeId ?? nodeIds[0]!;
      const primaryIndex = nodeIds.indexOf(primaryNodeId);
      return {
        atomic: true,
        operations: [{
          type: "node.paste",
          request: {
            x,
            y,
            primaryIndex,
            nodes: nodes.map((node, index) => ({
              title: node!.title,
              pageType: node!.pageType,
              purpose: node!.purpose,
              appSurfaceIds: [...node!.appSurfaceIds],
              ...(node!.statusGroupId ? { statusGroupId: node!.statusGroupId } : {}),
              domainIds: [...node!.domainIds],
              roleIds: [...node!.roleIds],
              permissions: [...node!.permissions],
              featureGroups: node!.featureGroups.map((group) => ({
                ...group,
                items: group.items.map((item) => ({ ...item })),
                ...(group.actions ? { actions: group.actions.map(({ targetNodeId: _targetNodeId, ...action }) => ({ ...action })) } : {})
              })),
              offsetX: positions[index]!.x - anchorX,
              offsetY: positions[index]!.y - anchorY
            }))
          }
        }],
        result: (results) => operationPayload(results[0]!)
      };
    }),
    createConnectedNode: (input) => runner.editFlow(input, (flow) => {
      const patch = readNodeDetailsPatch(input);
      if (!patch.pageType) {
        throw new Error("Connected node creation requires pageType.");
      }
      const maps = createIdMaps(flow);
      const from = readEndpoint(input.from, maps);
      const type = readMcpEdgeType(input);
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
