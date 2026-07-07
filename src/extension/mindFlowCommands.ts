import * as vscode from "vscode";
import type { EdgeType, FlowEndpoint } from "../domain/product-flow";
import type { UpdateEdgeDetailsInput, UpdateNodeDetailsInput } from "../domain/operations";
import type { UpdateProjectOverviewInput } from "../domain/operations";
import type { TaxonomyRequest } from "../domain/operations";
import type { SidebarView } from "./webviews/sidebar/SidebarView";
import { isMindFlowDocument, rememberRecentFlow, type FlowUriArgument } from "./flowContext";
import { createEdge, createConnectedNodeAt, createNodeAt, deleteNode, disconnectEdge, saveProjectOverviewPosition, updateAppSurfacePosition, updateEdgeDetails, updateNodeDetails, updateNodePosition, updateProjectOverviewDetails, type CreateConnectedNodeRequest } from "./commands/canvasCommands";
import { newFlow, openFlow, saveFlowAs, validateFlowJson } from "./commands/fileCommands";
import { updateTaxonomy } from "./commands/taxonomyCommands";

export function registerMindFlowCommands(
  context: vscode.ExtensionContext,
  sidebarView: SidebarView | undefined
): vscode.Disposable[] {
  return [
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isMindFlowDocument(document)) {
        void rememberRecentFlow(context, sidebarView, document.uri.fsPath);
      }
    }),
    vscode.commands.registerCommand("mindflow.newFlow", () => newFlow()),
    vscode.commands.registerCommand("mindflow.openFlow", (flowPath?: string) => openFlow(context, sidebarView, flowPath)),
    vscode.commands.registerCommand("mindflow.saveFlowAs", (flowUri?: FlowUriArgument) => saveFlowAs(context, sidebarView, flowUri)),
    vscode.commands.registerCommand("mindflow.validateFlowJson", () => validateFlowJson(context)),
    vscode.commands.registerCommand("mindflow.updateNodePosition", (nodeId?: string, x?: number, y?: number, flowUri?: FlowUriArgument) =>
      updateNodePosition(nodeId, x, y, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateAppSurfacePosition", (appId?: string, x?: number, y?: number, flowUri?: FlowUriArgument) =>
      updateAppSurfacePosition(appId, x, y, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateProjectOverviewPosition", (x?: number, y?: number, flowUri?: FlowUriArgument) =>
      saveProjectOverviewPosition(x, y, flowUri)
    ),
    vscode.commands.registerCommand(
      "mindflow.createNodeAt",
      (x?: number, y?: number, appSurfaceIds?: string[], domainIds?: string[], roleIds?: string[], flowUri?: FlowUriArgument) =>
        createNodeAt(context, x, y, appSurfaceIds, domainIds, roleIds, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateNodeDetails", (nodeId?: string, patch?: UpdateNodeDetailsInput, flowUri?: FlowUriArgument) =>
      updateNodeDetails(context, nodeId, patch, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.updateProjectOverview", (patch?: UpdateProjectOverviewInput, flowUri?: FlowUriArgument) =>
      updateProjectOverviewDetails(context, patch, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.createEdge", (from?: FlowEndpoint, to?: FlowEndpoint, trigger?: string, type?: EdgeType, flowUri?: FlowUriArgument) =>
      createEdge(context, from, to, trigger, type, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.createConnectedNodeAt", (request?: CreateConnectedNodeRequest, flowUri?: FlowUriArgument) =>
      createConnectedNodeAt(context, request, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.removeNode", (nodeId?: string, flowUri?: FlowUriArgument) => deleteNode(context, nodeId, flowUri)),
    vscode.commands.registerCommand("mindflow.updateEdgeDetails", (edgeId?: string, patch?: UpdateEdgeDetailsInput, flowUri?: FlowUriArgument) =>
      updateEdgeDetails(context, edgeId, patch, flowUri)
    ),
    vscode.commands.registerCommand("mindflow.removeEdge", (edgeId?: string, flowUri?: FlowUriArgument) => disconnectEdge(context, edgeId, flowUri)),
    vscode.commands.registerCommand("mindflow.updateTaxonomy", (request?: TaxonomyRequest, flowUri?: FlowUriArgument) => updateTaxonomy(context, request, flowUri))
  ];
}
