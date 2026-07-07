import * as vscode from "vscode";
import { recordEdgeDetailsRevision } from "./flowMessageOrdering";
import type { FlowEditorSelectionController } from "./flowSelectionController";
import type { WebviewMessage } from "../../../user-operations/flowWebviewMessages";

export interface FlowWebviewCommandDispatcher {
  documentUri: vscode.Uri;
  latestEdgeDetailsRevisions: Map<string, number>;
  selectionController: FlowEditorSelectionController;
  executeCommand(label: string, command: string, ...args: unknown[]): Promise<void>;
}

export async function dispatchFlowWebviewMessage(message: WebviewMessage, dispatcher: FlowWebviewCommandDispatcher): Promise<void> {
  switch (message.type) {
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
      await dispatcher.executeCommand("删除节点", "mindflow.removeNode", message.nodeId, dispatcher.documentUri);
      break;
    case "saveNodePosition":
      await dispatcher.executeCommand("保存节点位置", "mindflow.updateNodePosition", message.nodeId, message.x, message.y, dispatcher.documentUri);
      break;
    case "saveAppSurfacePosition":
      await dispatcher.executeCommand("保存应用端位置", "mindflow.updateAppSurfacePosition", message.appId, message.x, message.y, dispatcher.documentUri);
      break;
    case "saveProjectOverviewPosition":
      await dispatcher.executeCommand("保存项目概述位置", "mindflow.updateProjectOverviewPosition", message.x, message.y, dispatcher.documentUri);
      break;
    case "createNodeAt":
      await dispatcher.executeCommand(
        "创建节点",
        "mindflow.createNodeAt",
        message.x,
        message.y,
        message.appSurfaceIds,
        message.domainIds,
        message.roleIds,
        dispatcher.documentUri
      );
      break;
    case "updateNodeDetails":
      await dispatcher.executeCommand("更新节点详情", "mindflow.updateNodeDetails", message.nodeId, message.patch, dispatcher.documentUri);
      break;
    case "updateProjectOverview":
      await dispatcher.executeCommand("更新项目概述", "mindflow.updateProjectOverview", message.patch, dispatcher.documentUri);
      break;
    case "createEdge":
      await dispatcher.executeCommand("创建连线", "mindflow.createEdge", message.from, message.to, message.trigger, message.edgeType, dispatcher.documentUri);
      break;
    case "createConnectedNodeAt":
      await dispatcher.executeCommand("创建连接节点", "mindflow.createConnectedNodeAt", message.request, dispatcher.documentUri);
      break;
    case "updateEdgeDetails":
      if (!recordEdgeDetailsRevision(dispatcher.latestEdgeDetailsRevisions, message.edgeId, message.revision)) {
        return;
      }
      await dispatcher.executeCommand("更新连线详情", "mindflow.updateEdgeDetails", message.edgeId, message.patch, dispatcher.documentUri);
      break;
    case "removeEdge":
      await dispatcher.executeCommand("删除连线", "mindflow.removeEdge", message.edgeId, dispatcher.documentUri);
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
      await dispatcher.executeCommand("更新元数据", "mindflow.updateTaxonomy", message.request, dispatcher.documentUri);
      break;
    default:
      break;
  }
}

function setSelection(dispatcher: FlowWebviewCommandDispatcher, selection: Parameters<FlowEditorSelectionController["setSelection"]>[1]): void {
  dispatcher.selectionController.setSelection(dispatcher.documentUri, selection);
}
