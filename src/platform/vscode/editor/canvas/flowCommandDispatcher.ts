import * as vscode from "vscode";
import type { FlowOperation, TaxonomyRequest } from "../../../../product-flow/application/operations";
import { recordEdgeDetailsRevision } from "./flowMessageOrdering";
import type { FlowEditorSelectionController } from "./flowSelectionController";
import type { WebviewMessage } from "../../../webview/protocol/flowWebviewMessages";
import { parseMindFlowNodeClipboard, serializeMindFlowNodeClipboard } from "../../../webview/protocol/nodeClipboard";

export interface FlowWebviewApplyOptions {
  atomic?: boolean;
}

export interface FlowWebviewCommandDispatcher {
  documentUri: vscode.Uri;
  latestEdgeDetailsRevisions: Map<string, number>;
  selectionController: FlowEditorSelectionController;
  clipboard: {
    readText(): Thenable<string>;
    writeText(value: string): Thenable<void>;
  };
  postCommandResult(ok: boolean, message: string): void;
  applyOperations(label: string, operations: readonly FlowOperation[], options?: FlowWebviewApplyOptions): Promise<void>;
}

export async function dispatchFlowWebviewMessage(message: WebviewMessage, dispatcher: FlowWebviewCommandDispatcher): Promise<void> {
  switch (message.type) {
    case "flow.operation":
      await dispatcher.applyOperations("更新画布", [message.operation]);
      break;
    case "flow.operations":
      await dispatcher.applyOperations("更新画布", message.operations, { atomic: true });
      break;
    case "copyNodes":
      try {
        await dispatcher.clipboard.writeText(serializeMindFlowNodeClipboard(message.payload));
        dispatcher.postCommandResult(true, `已复制 ${message.payload.nodes.length} 个节点。`);
      } catch (error) {
        dispatcher.postCommandResult(false, `复制节点失败：${errorMessage(error)}`);
      }
      break;
    case "pasteNodesAt": {
      let payload;
      try {
        payload = parseMindFlowNodeClipboard(await dispatcher.clipboard.readText());
      } catch (error) {
        dispatcher.postCommandResult(false, `读取系统剪贴板失败：${errorMessage(error)}`);
        break;
      }
      if (!payload) {
        dispatcher.postCommandResult(false, "系统剪贴板中没有可粘贴的 MindFlow 节点，请先使用 Cmd/Ctrl+C 复制已选节点。");
        break;
      }
      await dispatcher.applyOperations("粘贴节点", [{
        type: "node.paste",
        request: {
          nodes: payload.nodes,
          primaryIndex: payload.primaryIndex,
          x: message.x,
          y: message.y
        }
      }], { atomic: true });
      break;
    }
    case "selectNode":
      setSelection(dispatcher, { selectedProjectOverview: false, selectedNodeId: message.nodeId, selectedNodeIds: message.selectedNodeIds });
      break;
    case "selectEdge":
      setSelection(dispatcher, { selectedProjectOverview: false, selectedEdgeId: message.edgeId });
      break;
    case "selectAppSurface":
      setSelection(dispatcher, { selectedProjectOverview: false, selectedAppSurfaceId: message.appId });
      break;
    case "selectDomain":
      setSelection(dispatcher, { selectedProjectOverview: false, selectedDomainId: message.domainId });
      break;
    case "selectRole":
      setSelection(dispatcher, { selectedProjectOverview: false, selectedRoleId: message.roleId });
      break;
    case "selectStatusGroup":
      setSelection(dispatcher, { selectedProjectOverview: false, selectedStatusGroupId: message.statusGroupId });
      break;
    case "clearSelection":
      setSelection(dispatcher, {});
      break;
    case "selectProjectOverview":
      setSelection(dispatcher, { selectedProjectOverview: true });
      break;
    case "deleteNode":
      setSelection(dispatcher, { selectedProjectOverview: false, selectedNodeId: message.nodeId });
      await dispatcher.applyOperations("删除节点", [{ type: "node.remove", nodeId: message.nodeId }]);
      break;
    case "saveNodePosition":
      await dispatcher.applyOperations("保存节点位置", [{ type: "node.move", nodeId: message.nodeId, x: message.x, y: message.y }]);
      break;
    case "saveAppSurfacePosition":
      await dispatcher.applyOperations("保存应用端位置", [{ type: "appSurface.move", appId: message.appId, x: message.x, y: message.y }]);
      break;
    case "saveProjectOverviewPosition":
      await dispatcher.applyOperations("保存项目概述位置", [{ type: "project.move", x: message.x, y: message.y }]);
      break;
    case "saveAutoLayoutPositions":
      await dispatcher.applyOperations("应用自动排版", autoLayoutPositionOperations(message.projectOverviewPosition, message.appSurfacePositions, message.nodePositions), { atomic: true });
      break;
    case "createNodeAt":
      await dispatcher.applyOperations("创建节点", [{
        type: "node.create",
        input: {
          x: message.x,
          y: message.y,
          appSurfaceIds: message.appSurfaceIds,
          domainIds: message.domainIds,
          roleIds: message.roleIds
        }
      }]);
      break;
    case "updateNodeDetails":
      await dispatcher.applyOperations("更新节点详情", [{ type: "node.update", nodeId: message.nodeId, patch: message.patch }]);
      break;
    case "updateProjectOverview":
      await dispatcher.applyOperations("更新项目概述", [{ type: "project.update", patch: message.patch }]);
      break;
    case "createEdge":
      await dispatcher.applyOperations("创建连线", [{ type: "edge.upsert", input: { from: message.from, to: message.to, trigger: message.trigger, type: message.edgeType } }]);
      break;
    case "createConnectedNodeAt":
      await dispatcher.applyOperations("创建连接节点", [{ type: "node.createConnected", request: message.request }]);
      break;
    case "updateEdgeDetails":
      if (!recordEdgeDetailsRevision(dispatcher.latestEdgeDetailsRevisions, message.edgeId, message.revision)) {
        return;
      }
      await dispatcher.applyOperations("更新连线详情", [{ type: "edge.update", edgeId: message.edgeId, patch: message.patch }]);
      break;
    case "removeEdge":
      await dispatcher.applyOperations("删除连线", [{ type: "edge.remove", edgeId: message.edgeId }]);
      break;
    case "updateTaxonomy":
      if (message.request.action === "delete") {
        const selection = dispatcher.selectionController.getSelection(dispatcher.documentUri);
        if (message.request.kind === "appSurface") {
          selection.selectedAppSurfaceId = undefined;
        } else if (message.request.kind === "domain") {
          selection.selectedDomainId = undefined;
        } else if (message.request.kind === "role") {
          selection.selectedRoleId = undefined;
        } else if (message.request.kind === "statusGroup") {
          selection.selectedStatusGroupId = undefined;
        }
        dispatcher.selectionController.setSelection(dispatcher.documentUri, selection);
      }
      await dispatcher.applyOperations("更新元数据", [taxonomyOperationFromRequest(message.request)]);
      break;
    default:
      break;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setSelection(dispatcher: FlowWebviewCommandDispatcher, selection: Parameters<FlowEditorSelectionController["setSelection"]>[1]): void {
  dispatcher.selectionController.setSelection(dispatcher.documentUri, selection);
}

function autoLayoutPositionOperations(
  projectOverviewPosition: { x: number; y: number },
  appSurfacePositions: Record<string, { x: number; y: number }>,
  nodePositions: Record<string, { x: number; y: number }>
): FlowOperation[] {
  return [
    { type: "project.move", x: projectOverviewPosition.x, y: projectOverviewPosition.y },
    ...Object.entries(appSurfacePositions).map(([appId, position]): FlowOperation => ({
      type: "appSurface.move",
      appId,
      x: position.x,
      y: position.y
    })),
    ...Object.entries(nodePositions).map(([nodeId, position]): FlowOperation => ({
      type: "node.move",
      nodeId,
      x: position.x,
      y: position.y
    }))
  ];
}

function taxonomyOperationFromRequest(request: TaxonomyRequest): FlowOperation {
  if (request.action === "delete") {
    if (!request.id) {
      throw new Error(`Deleting ${request.kind} requires id.`);
    }
    return { type: "taxonomy.remove", kind: request.kind, id: request.id };
  }
  return { type: "taxonomy.upsert", kind: request.kind, id: request.id, item: request.item };
}
