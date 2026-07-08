// @ts-nocheck
function postWebviewMessage(message) {
  vscode.postMessage(hostMessageFromClientMessage(message));
}

function hostMessageFromClientMessage(message) {
  if (!message || typeof message.type !== "string") {
    return message;
  }
  switch (message.type) {
    case "selectNode":
    case "selectEdge":
    case "selectAppSurface":
    case "selectDomain":
    case "selectRole":
    case "selectStatusGroup":
    case "selectProjectOverview":
    case "clearSelection":
      return message;
    case "deleteNode":
      return flowOperationMessage({ type: "node.remove", nodeId: message.nodeId });
    case "saveNodePosition":
      return flowOperationMessage({ type: "node.move", nodeId: message.nodeId, x: message.x, y: message.y });
    case "saveAppSurfacePosition":
      return flowOperationMessage({ type: "appSurface.move", appId: message.appId, x: message.x, y: message.y });
    case "saveProjectOverviewPosition":
      return flowOperationMessage({ type: "project.move", x: message.x, y: message.y });
    case "saveAutoLayoutPositions":
      return {
        type: "flow.operations",
        operations: [
          { type: "project.move", x: message.projectOverviewPosition.x, y: message.projectOverviewPosition.y },
          ...Object.entries(message.appSurfacePositions || {}).map(([appId, position]) => ({ type: "appSurface.move", appId, x: position.x, y: position.y })),
          ...Object.entries(message.nodePositions || {}).map(([nodeId, position]) => ({ type: "node.move", nodeId, x: position.x, y: position.y }))
        ]
      };
    case "createNodeAt":
      return flowOperationMessage({
        type: "node.create",
        input: {
          x: message.x,
          y: message.y,
          appSurfaceIds: message.appSurfaceIds,
          domainIds: message.domainIds,
          roleIds: message.roleIds
        }
      });
    case "updateNodeDetails":
      return flowOperationMessage({ type: "node.update", nodeId: message.nodeId, patch: message.patch });
    case "updateProjectOverview":
      return flowOperationMessage({ type: "project.update", patch: message.patch });
    case "createEdge":
      return flowOperationMessage({ type: "edge.upsert", input: { from: message.from, to: message.to, trigger: message.trigger, type: message.edgeType } });
    case "createConnectedNodeAt":
      return flowOperationMessage({ type: "node.createConnected", request: message.request });
    case "updateEdgeDetails":
      return {
        type: "flow.operation",
        revision: message.revision,
        edgeId: message.edgeId,
        operation: { type: "edge.update", edgeId: message.edgeId, patch: message.patch }
      };
    case "removeEdge":
      return flowOperationMessage({ type: "edge.remove", edgeId: message.edgeId });
    case "updateTaxonomy":
      return flowOperationMessage(taxonomyOperationFromClientRequest(message.request));
    default:
      return message;
  }
}

function flowOperationMessage(operation) {
  return { type: "flow.operation", operation };
}

function taxonomyOperationFromClientRequest(request) {
  if (request.action === "delete") {
    return { type: "taxonomy.remove", kind: request.kind, id: request.id };
  }
  return { type: "taxonomy.upsert", kind: request.kind, id: request.id, item: request.item };
}
