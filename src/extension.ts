import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { createAgentProvider, configureAgent } from "./agents/providerFactory";
import type { FlowChangePlan } from "./models/flowChange";
import type {
  AppSurface,
  BusinessDomain,
  EdgeType,
  FlowEdge,
  FlowEndpoint,
  PageNode,
  ProductFlow,
  ProductStatusGroup,
  UserRole
} from "./models/productFlow";
import { validateProductFlow } from "./models/productFlow";
import { applyFlowChangePlan } from "./changes/flowChangeApplier";
import { proposeValidatedFlowChange } from "./changes/flowChangePlanner";
import { summarizeChangePlan } from "./changes/flowDiff";
import { revertLastChangeSet } from "./changes/revertChangeSet";
import {
  createManualEdge,
  createManualNode,
  removeManualNode,
  removeManualEdge,
  updateManualAppSurfacePosition,
  updateManualEdgeDetails,
  updateManualNodeDetails,
  updateManualNodePosition,
  type UpdateEdgeDetailsInput,
  type UpdateNodeDetailsInput
} from "./core/flowEditing";
import { createEmptyProductFlow } from "./core/emptyFlow";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "./core/taxonomyEditing";
import { createUntitledMindFlowDocumentOptions } from "./core/untitledMindFlowDocument";
import { ArtifactRepository } from "./storage/artifactRepository";
import { FlowRepository, writeJsonAtomic } from "./storage/flowRepository";
import { RecentFlowStore } from "./storage/recentFlows";
import { applySyncReport, buildSyncReport, collectArtifactSnapshots } from "./sync/syncArtifacts";
import { nowIso, shortHash, slugify } from "./utils/id";
import { FlowPanel } from "./webview/FlowPanel";
import { SidebarView } from "./webview/SidebarView";

let currentFlowPath: string | undefined;
let pendingChangePlan: FlowChangePlan | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const sidebarView = new SidebarView(context, getWorkspaceRoot);
  context.subscriptions.push(
    FlowPanel.register(context, (flowUri) => {
      if (isRealMindFlowUri(flowUri)) {
        void rememberRecentFlow(context, sidebarView, flowUri.fsPath);
      }
    }),
    vscode.window.registerWebviewViewProvider(SidebarView.viewId, sidebarView)
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isMindFlowDocument(document)) {
        void rememberRecentFlow(context, sidebarView, document.uri.fsPath);
      }
    }),
    vscode.commands.registerCommand("mindflow.newFlow", () => newFlow()),
    vscode.commands.registerCommand("mindflow.analyzeDocument", () => analyzeDocument(context, sidebarView)),
    vscode.commands.registerCommand("mindflow.openFlow", (flowPath?: string) => openFlow(context, sidebarView, flowPath)),
    vscode.commands.registerCommand("mindflow.modifyFlowByInstruction", (instruction?: string, nodeId?: string) =>
      modifyFlowByInstruction(context, instruction, nodeId)
    ),
    vscode.commands.registerCommand("mindflow.previewChangeSet", () => previewChangeSet()),
    vscode.commands.registerCommand("mindflow.applyChangeSet", () => applyChangeSet(context)),
    vscode.commands.registerCommand("mindflow.revertLastChangeSet", () => revertLastChange(context)),
    vscode.commands.registerCommand("mindflow.validateFlowJson", () => validateFlowJson(context)),
    vscode.commands.registerCommand("mindflow.generateNodePrd", (nodeId?: string) => generateNodePrd(context, nodeId)),
    vscode.commands.registerCommand("mindflow.generateFullPrd", () => generateFullPrd(context)),
    vscode.commands.registerCommand("mindflow.refreshStalePrd", () => refreshStalePrd(context)),
    vscode.commands.registerCommand("mindflow.generateNodePencil", (nodeId?: string) => generateNodePencil(context, nodeId)),
    vscode.commands.registerCommand("mindflow.generateFullPencil", () => generateFullPencil(context)),
    vscode.commands.registerCommand("mindflow.refreshStalePencil", () => refreshStalePencil(context)),
    vscode.commands.registerCommand("mindflow.syncArtifacts", () => syncArtifacts(context)),
    vscode.commands.registerCommand("mindflow.openArtifact", (artifactPath?: string) => openArtifact(artifactPath)),
    vscode.commands.registerCommand("mindflow.updateNodePosition", (nodeId?: string, x?: number, y?: number) =>
      updateNodePosition(nodeId, x, y)
    ),
    vscode.commands.registerCommand("mindflow.updateAppSurfacePosition", (appId?: string, x?: number, y?: number) =>
      updateAppSurfacePosition(appId, x, y)
    ),
    vscode.commands.registerCommand("mindflow.updateLayoutPositions", (request?: LayoutPositionsRequest) =>
      updateLayoutPositions(request)
    ),
    vscode.commands.registerCommand(
      "mindflow.createNodeAt",
      (x?: number, y?: number, appSurfaceIds?: string[], domainIds?: string[], roleIds?: string[]) =>
        createNodeAt(context, x, y, appSurfaceIds, domainIds, roleIds)
    ),
    vscode.commands.registerCommand("mindflow.updateNodeDetails", (nodeId?: string, patch?: UpdateNodeDetailsInput) =>
      updateNodeDetails(context, nodeId, patch)
    ),
    vscode.commands.registerCommand("mindflow.createEdge", (from?: FlowEndpoint, to?: FlowEndpoint, trigger?: string, type?: EdgeType) =>
      createEdge(context, from, to, trigger, type)
    ),
    vscode.commands.registerCommand("mindflow.createConnectedNodeAt", (request?: CreateConnectedNodeRequest) =>
      createConnectedNodeAt(context, request)
    ),
    vscode.commands.registerCommand("mindflow.removeNode", (nodeId?: string) => deleteNode(context, nodeId)),
    vscode.commands.registerCommand("mindflow.updateEdgeDetails", (edgeId?: string, patch?: UpdateEdgeDetailsInput) =>
      updateEdgeDetails(context, edgeId, patch)
    ),
    vscode.commands.registerCommand("mindflow.removeEdge", (edgeId?: string) => disconnectEdge(context, edgeId)),
    vscode.commands.registerCommand("mindflow.updateTaxonomy", (request?: TaxonomyRequest) => updateTaxonomy(context, request)),
    vscode.commands.registerCommand("mindflow.configureAgent", () => configureAgent(context))
  );
}

export function deactivate(): void {
  // No background resources are held.
}

async function newFlow(): Promise<void> {
  try {
    const flow = createEmptyProductFlow();
    const document = await vscode.workspace.openTextDocument(createUntitledMindFlowDocumentOptions(flow));
    currentFlowPath = undefined;
    pendingChangePlan = undefined;
    await vscode.commands.executeCommand("vscode.openWith", document.uri, FlowPanel.viewType);
  } catch (error) {
    showError("Create blank MindFlow failed", error);
  }
}

async function analyzeDocument(context: vscode.ExtensionContext, sidebarView?: SidebarView): Promise<void> {
  try {
    const input = await readDocumentInput();
    if (!input) {
      return;
    }
    const provider = await createAgentProvider(context);
    const flow = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "MindFlow analyzing document" },
      () => provider.analyzeDocument(input)
    );
    const repository = createFlowRepository();
    const flowPath = await repository.save(flow);
    await rememberRecentFlow(context, sidebarView, flowPath);
    pendingChangePlan = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath);
    vscode.window.showInformationMessage(`MindFlow saved file: ${repository.relativePath(flowPath)}`);
  } catch (error) {
    showError("Analyze document failed", error);
  }
}

async function openFlow(context: vscode.ExtensionContext, sidebarView: SidebarView | undefined, flowPath?: string): Promise<void> {
  try {
    const repository = createFlowRepository();
    const resolvedPath = flowPath ?? (await pickMindFlowFile(repository));
    if (!resolvedPath) {
      return;
    }
    const flow = await repository.load(resolvedPath);
    await rememberRecentFlow(context, sidebarView, resolvedPath);
    FlowPanel.createOrShow(context.extensionUri, flow, resolvedPath, pendingChangePlan);
  } catch (error) {
    showError("Open flow failed", error);
  }
}

async function modifyFlowByInstruction(context: vscode.ExtensionContext, instructionArg?: string, nodeIdArg?: string): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const instruction =
      instructionArg ??
      (await vscode.window.showInputBox({
        title: "MindFlow flow change instruction",
        prompt: "Example: 在合同编辑页和合同审批工作台之间加入风险复核业务",
        ignoreFocusOut: true
      }));
    if (!instruction) {
      return;
    }
    const selectedNodeId = nodeIdArg ?? FlowPanel.selectedNodeId;
    const provider = await createAgentProvider(context);
    const plan = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "MindFlow planning flow change" },
      () => proposeValidatedFlowChange(provider, flow, instruction, selectedNodeId)
    );
    pendingChangePlan = plan;
    currentFlowPath = flowPath;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, plan);
    if (plan.requiresClarification) {
      vscode.window.showWarningMessage(`MindFlow needs clarification: ${plan.openQuestions.join("; ")}`);
      return;
    }
    const summary = summarizeChangePlan(plan);
    vscode.window.showInformationMessage(`ChangeSet ready: ${summary.added.length} added, ${summary.changed.length} changed, ${summary.removed.length} removed.`);
  } catch (error) {
    showError("Modify flow failed", error);
  }
}

async function previewChangeSet(): Promise<void> {
  if (!pendingChangePlan) {
    vscode.window.showWarningMessage("No pending MindFlow ChangeSet.");
    return;
  }
  const summary = summarizeChangePlan(pendingChangePlan);
  const doc = await vscode.workspace.openTextDocument({
    content: `${summary.text}\n\n${JSON.stringify(pendingChangePlan, null, 2)}\n`,
    language: "json"
  });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}

async function applyChangeSet(context: vscode.ExtensionContext): Promise<void> {
  try {
    if (!pendingChangePlan) {
      vscode.window.showWarningMessage("No pending MindFlow ChangeSet.");
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    const summary = summarizeChangePlan(pendingChangePlan);
    const hasDestructive = summary.destructiveOperationCount > 0;
    if (hasDestructive) {
      const confirmed = await vscode.window.showWarningMessage(
        `This ChangeSet has ${summary.destructiveOperationCount} destructive operation(s). Apply it?`,
        { modal: true },
        "Apply"
      );
      if (confirmed !== "Apply") {
        return;
      }
    }
    const next = applyFlowChangePlan(flow, pendingChangePlan, { confirmedDestructive: hasDestructive });
    await applyFlowDocumentEdit(flowPath, next);
    pendingChangePlan = undefined;
    FlowPanel.createOrShow(context.extensionUri, next, flowPath);
    vscode.window.showInformationMessage(`Applied ChangeSet. ProductFlow revision is now ${next.revision}.`);
  } catch (error) {
    showError("Apply ChangeSet failed", error);
  }
}

async function revertLastChange(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const confirmed = await vscode.window.showWarningMessage("Revert the latest applied MindFlow ChangeSet?", { modal: true }, "Revert");
    if (confirmed !== "Revert") {
      return;
    }
    const next = revertLastChangeSet(flow);
    await applyFlowDocumentEdit(flowPath, next);
    pendingChangePlan = undefined;
    FlowPanel.createOrShow(context.extensionUri, next, flowPath);
    vscode.window.showInformationMessage(`Reverted latest ChangeSet. ProductFlow revision is now ${next.revision}.`);
  } catch (error) {
    showError("Revert ChangeSet failed", error);
  }
}

async function validateFlowJson(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const validation = validateProductFlow(flow);
    if (validation.valid) {
      vscode.window.showInformationMessage(`ProductFlow is valid: ${path.basename(flowPath)}${validation.warnings.length ? ` (${validation.warnings.length} warning(s))` : ""}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument({
      content: validation.errors.join("\n"),
      language: "plaintext"
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Validate ProductFlow failed", error);
  }
}

async function generateNodePrd(context: vscode.ExtensionContext, nodeIdArg?: string): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const node = await resolveNode(flow, nodeIdArg ?? FlowPanel.selectedNodeId);
    if (!node) {
      return;
    }
    const provider = await createAgentProvider(context);
    const artifact = await provider.generateNodePrd(flow, node, latestStaleChangeSetId(flow, node.nodeId));
    const repository = new ArtifactRepository(getWorkspaceRoot());
    const written = await repository.writePrd(flow, artifact);
    markNodePrdActive(flow, node.nodeId, written.ref.prdId);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
    vscode.window.showInformationMessage(`Generated PRD: ${written.relativePath}`);
  } catch (error) {
    showError("Generate node PRD failed", error);
  }
}

async function generateFullPrd(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const provider = await createAgentProvider(context);
    const artifact = await provider.generateFullPrd(flow);
    const written = await new ArtifactRepository(getWorkspaceRoot()).writePrd(flow, artifact);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
    vscode.window.showInformationMessage(`Generated full PRD: ${written.relativePath}`);
  } catch (error) {
    showError("Generate full PRD failed", error);
  }
}

async function refreshStalePrd(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow } = await loadCurrentFlow();
    const stale = flow.artifacts.prds.filter((ref) => ref.status === "stale");
    if (stale.length === 0) {
      vscode.window.showInformationMessage("No stale PRD artifacts.");
      return;
    }
    const selected = await vscode.window.showQuickPick(
      stale.map((ref) => ({ label: ref.prdId, description: ref.nodeId ?? "full", ref })),
      { title: "Refresh stale PRD" }
    );
    if (!selected) {
      return;
    }
    if (selected.ref.scope === "node" && selected.ref.nodeId) {
      await generateNodePrd(context, selected.ref.nodeId);
    } else {
      await generateFullPrd(context);
    }
  } catch (error) {
    showError("Refresh stale PRD failed", error);
  }
}

async function generateNodePencil(context: vscode.ExtensionContext, nodeIdArg?: string): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const node = await resolveNode(flow, nodeIdArg ?? FlowPanel.selectedNodeId);
    if (!node) {
      return;
    }
    const provider = await createAgentProvider(context);
    const artifact = await provider.generateNodePencil(flow, node, latestStaleChangeSetId(flow, node.nodeId));
    const repository = new ArtifactRepository(getWorkspaceRoot());
    const written = await repository.writePencil(flow, artifact);
    markNodePencilActive(flow, node.nodeId, written.ref.pencilId);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
    vscode.window.showInformationMessage(`Generated Pencil design spec: ${written.relativePath}`);
  } catch (error) {
    showError("Generate node Pencil failed", error);
  }
}

async function generateFullPencil(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const provider = await createAgentProvider(context);
    const artifact = await provider.generateFullPencil(flow);
    const written = await new ArtifactRepository(getWorkspaceRoot()).writePencil(flow, artifact);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
    vscode.window.showInformationMessage(`Generated full Pencil design spec: ${written.relativePath}`);
  } catch (error) {
    showError("Generate full Pencil failed", error);
  }
}

async function refreshStalePencil(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow } = await loadCurrentFlow();
    const stale = flow.artifacts.pencils.filter((ref) => ref.status === "stale");
    if (stale.length === 0) {
      vscode.window.showInformationMessage("No stale Pencil artifacts.");
      return;
    }
    const selected = await vscode.window.showQuickPick(
      stale.map((ref) => ({ label: ref.pencilId, description: ref.nodeId ?? "full", ref })),
      { title: "Refresh stale Pencil design spec" }
    );
    if (!selected) {
      return;
    }
    if (selected.ref.scope === "node" && selected.ref.nodeId) {
      await generateNodePencil(context, selected.ref.nodeId);
    } else {
      await generateFullPencil(context);
    }
  } catch (error) {
    showError("Refresh stale Pencil failed", error);
  }
}

async function syncArtifacts(context: vscode.ExtensionContext): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const workspaceRoot = getWorkspaceRoot();
    const snapshots = collectArtifactSnapshots(workspaceRoot, flow);
    const report = buildSyncReport(flow, snapshots);
    const next = applySyncReport(flow, report);
    await applyFlowDocumentEdit(flowPath, next);
    const reportPath = path.join(workspaceRoot, ".mindflow", `sync-report-${flow.flowId}.json`);
    await writeJsonAtomic(reportPath, report);
    FlowPanel.createOrShow(context.extensionUri, next, flowPath, pendingChangePlan);
    const errors = report.issues.filter((issue) => issue.severity === "error").length;
    const warnings = report.issues.filter((issue) => issue.severity === "warning").length;
    vscode.window.showInformationMessage(`Sync complete: ${errors} error(s), ${warnings} warning(s). Report: ${path.relative(workspaceRoot, reportPath)}`);
  } catch (error) {
    showError("Sync artifacts failed", error);
  }
}

async function openArtifact(artifactPath?: string): Promise<void> {
  try {
    const target = artifactPath ?? currentFlowPath;
    if (!target) {
      vscode.window.showWarningMessage("No MindFlow artifact path is available.");
      return;
    }
    const absolutePath = path.isAbsolute(target) ? target : path.join(getWorkspaceRoot(), target);
    const doc = await vscode.workspace.openTextDocument(absolutePath);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  } catch (error) {
    showError("Open MindFlow artifact failed", error);
  }
}

async function updateNodePosition(nodeId?: string, x?: number, y?: number): Promise<void> {
  try {
    if (!nodeId || typeof x !== "number" || typeof y !== "number") {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualNodePosition(flow, nodeId, x, y);
    await applyFlowDocumentEdit(flowPath, flow);
  } catch (error) {
    showError("Update node position failed", error);
  }
}

async function updateAppSurfacePosition(appId?: string, x?: number, y?: number): Promise<void> {
  try {
    if (!appId || typeof x !== "number" || typeof y !== "number") {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualAppSurfacePosition(flow, appId, x, y);
    await applyFlowDocumentEdit(flowPath, flow);
  } catch (error) {
    showError("Update app surface position failed", error);
  }
}

interface LayoutNodePositionInput {
  nodeId?: string;
  x?: number;
  y?: number;
}

interface LayoutAppSurfacePositionInput {
  appId?: string;
  x?: number;
  y?: number;
}

interface LayoutPositionsRequest {
  nodes?: LayoutNodePositionInput[];
  appSurfaces?: LayoutAppSurfacePositionInput[];
}

async function updateLayoutPositions(request?: LayoutPositionsRequest): Promise<void> {
  try {
    const nodePositions = Array.isArray(request?.nodes) ? request.nodes : [];
    const appSurfacePositions = Array.isArray(request?.appSurfaces) ? request.appSurfaces : [];
    if (nodePositions.length === 0 && appSurfacePositions.length === 0) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    for (const item of nodePositions) {
      if (item.nodeId && typeof item.x === "number" && typeof item.y === "number") {
        updateManualNodePosition(flow, item.nodeId, item.x, item.y);
      }
    }
    for (const item of appSurfacePositions) {
      if (item.appId && typeof item.x === "number" && typeof item.y === "number") {
        updateManualAppSurfacePosition(flow, item.appId, item.x, item.y);
      }
    }
    await applyFlowDocumentEdit(flowPath, flow);
  } catch (error) {
    showError("Update layout positions failed", error);
  }
}

async function createNodeAt(
  context: vscode.ExtensionContext,
  x?: number,
  y?: number,
  appSurfaceIds?: string[],
  domainIds?: string[],
  roleIds?: string[]
): Promise<void> {
  try {
    const { flow, flowPath } = await loadCurrentFlow();
    const node = createManualNode(flow, {
      x,
      y,
      appSurfaceIds: Array.isArray(appSurfaceIds) ? appSurfaceIds : undefined,
      domainIds: Array.isArray(domainIds) ? domainIds : undefined,
      roleIds: Array.isArray(roleIds) ? roleIds : undefined
    });
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = node.nodeId;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Create node failed", error);
  }
}

async function updateNodeDetails(context: vscode.ExtensionContext, nodeId?: string, patch?: UpdateNodeDetailsInput): Promise<void> {
  try {
    if (!nodeId || !patch) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualNodeDetails(flow, nodeId, patch);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = nodeId;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Update node details failed", error);
  }
}

async function createEdge(
  context: vscode.ExtensionContext,
  from?: FlowEndpoint,
  to?: FlowEndpoint,
  trigger?: string,
  type?: EdgeType
): Promise<void> {
  try {
    if (!from || !to) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    const edge = createManualEdge(flow, { from, to, trigger, type });
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = undefined;
    FlowPanel.selectedEdgeId = edge.edgeId;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Create edge failed", error);
  }
}

interface CreateConnectedNodeRequest {
  from?: FlowEndpoint;
  to?: FlowEndpoint;
  toNodeId?: string;
  x?: number;
  y?: number;
  trigger?: string;
  type?: EdgeType;
  appSurfaceIds?: string[];
  domainIds?: string[];
  roleIds?: string[];
}

async function createConnectedNodeAt(context: vscode.ExtensionContext, request?: CreateConnectedNodeRequest): Promise<void> {
  try {
    if (!request || (!request.from && !request.to && !request.toNodeId)) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    const to = request.to ?? (request.toNodeId ? { kind: "node" as const, nodeId: request.toNodeId } : undefined);
    const relatedNode = request.from
      ? request.from.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === request.from?.nodeId)
      : to?.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === to?.nodeId);
    const relatedAppSurfaceIds = request.from?.kind === "appSurface"
      ? [request.from.appId ?? request.from.nodeId]
      : to?.kind === "appSurface"
        ? [to.appId ?? to.nodeId]
        : relatedNode?.appSurfaceIds;
    const node = createManualNode(flow, {
      x: request.x,
      y: request.y,
      appSurfaceIds: nonEmptyArrayOr(request.appSurfaceIds, relatedAppSurfaceIds),
      domainIds: nonEmptyArrayOr(request.domainIds, relatedNode?.domainIds),
      roleIds: nonEmptyArrayOr(request.roleIds, relatedNode?.roleIds)
    });
    if (request.from) {
      createManualEdge(flow, {
        from: request.from,
        to: { kind: "node", nodeId: node.nodeId },
        trigger: request.trigger,
        type: request.type
      });
    } else if (to) {
      createManualEdge(flow, {
        from: { kind: "node", nodeId: node.nodeId },
        to,
        trigger: request.trigger,
        type: request.type
      });
    }
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = node.nodeId;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Create connected node failed", error);
  }
}

function nonEmptyArrayOr(value: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

async function deleteNode(context: vscode.ExtensionContext, nodeId?: string): Promise<void> {
  try {
    if (!nodeId) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    removeManualNode(flow, nodeId);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = undefined;
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Delete node failed", error);
  }
}

async function updateEdgeDetails(context: vscode.ExtensionContext, edgeId?: string, patch?: UpdateEdgeDetailsInput): Promise<void> {
  try {
    if (!edgeId || !patch) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    updateManualEdgeDetails(flow, edgeId, patch);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedNodeId = undefined;
    FlowPanel.selectedEdgeId = edgeId;
    FlowPanel.selectedAppSurfaceId = undefined;
    FlowPanel.selectedDomainId = undefined;
    FlowPanel.selectedRoleId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Update edge details failed", error);
  }
}

async function disconnectEdge(context: vscode.ExtensionContext, edgeId?: string): Promise<void> {
  try {
    if (!edgeId) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    removeManualEdge(flow, edgeId);
    await applyFlowDocumentEdit(flowPath, flow);
    FlowPanel.selectedEdgeId = undefined;
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Disconnect edge failed", error);
  }
}

async function updateTaxonomy(context: vscode.ExtensionContext, request?: TaxonomyRequest): Promise<void> {
  try {
    if (!request) {
      return;
    }
    const { flow, flowPath } = await loadCurrentFlow();
    applyTaxonomyRequest(flow, request);
    await applyFlowDocumentEdit(flowPath, flow);
    if (request.action === "delete") {
      if (request.kind === "appSurface") {
        FlowPanel.selectedAppSurfaceId = undefined;
      } else if (request.kind === "domain") {
        FlowPanel.selectedDomainId = undefined;
      } else if (request.kind === "role") {
        FlowPanel.selectedRoleId = undefined;
      }
    }
    FlowPanel.createOrShow(context.extensionUri, flow, flowPath, pendingChangePlan);
  } catch (error) {
    showError("Update MindFlow metadata failed", error);
  }
}

async function readDocumentInput(): Promise<{ documentText: string; documentName: string; sourceDocumentId?: string } | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selection = editor.selection;
    const selected = !selection.isEmpty ? editor.document.getText(selection) : editor.document.getText();
    return {
      documentText: selected,
      documentName: editor.document.isUntitled ? "untitled.md" : path.basename(editor.document.uri.fsPath),
      sourceDocumentId: editor.document.isUntitled ? editor.document.uri.toString() : editor.document.uri.fsPath
    };
  }
  const picked = await vscode.window.showOpenDialog({
    title: "Select product document",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      Documents: ["md", "txt", "docx"]
    }
  });
  const uri = picked?.[0];
  if (!uri) {
    return undefined;
  }
  if (uri.fsPath.toLowerCase().endsWith(".docx")) {
    vscode.window.showWarningMessage("DOCX text extraction is limited in this MVP. Convert to Markdown or TXT for best results.");
  }
  const buffer = await fs.readFile(uri.fsPath);
  return {
    documentText: buffer.toString("utf8"),
    documentName: path.basename(uri.fsPath),
    sourceDocumentId: uri.fsPath
  };
}

async function resolveNode(flow: ProductFlow, nodeId?: string): Promise<PageNode | undefined> {
  if (nodeId) {
    const found = flow.nodes.find((node) => node.nodeId === nodeId);
    if (found) {
      return found;
    }
  }
  const selected = await vscode.window.showQuickPick(
    flow.nodes
      .filter((node) => node.status === "active")
      .map((node) => ({ label: node.title, description: node.nodeId, node })),
    { title: "Select ProductFlow node" }
  );
  return selected?.node;
}

async function loadCurrentFlow(): Promise<{ flow: ProductFlow; flowPath: string }> {
  const repository = createFlowRepository();
  const flowPath = currentFlowPath ?? (await chooseOrLatestFlow(repository));
  if (!flowPath) {
    throw new Error("No MindFlow file exists. Run MindFlow: Analyze Document first.");
  }
  const document = await vscode.workspace.openTextDocument(flowPath);
  const parsed = JSON.parse(document.getText()) as unknown;
  const validation = validateProductFlow(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid ProductFlow document ${flowPath}:\n${validation.errors.join("\n")}`);
  }
  const flow = parsed as ProductFlow;
  currentFlowPath = flowPath;
  return { flow, flowPath };
}

async function applyFlowDocumentEdit(flowPath: string, flow: ProductFlow): Promise<void> {
  flow.updatedAt = nowIso();
  pruneMissingAppSurfaceReferences(flow);
  const validation = validateProductFlow(flow);
  if (!validation.valid) {
    throw new Error(`Cannot apply invalid ProductFlow:\n${validation.errors.join("\n")}`);
  }
  const document = await vscode.workspace.openTextDocument(flowPath);
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, fullRange, `${JSON.stringify(flow, null, 2)}\n`);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    throw new Error("VSCode refused the ProductFlow document edit.");
  }
}

async function chooseOrLatestFlow(repository: FlowRepository): Promise<string | undefined> {
  const files = await repository.list();
  if (files.length === 0) {
    return undefined;
  }
  if (files.length === 1) {
    return files[0];
  }
  const latest = await repository.latest();
  const selected = await vscode.window.showQuickPick(
    files.map((file) => ({
      label: path.basename(file),
      description: file === latest ? "latest" : repository.relativePath(file),
      file
    })),
    { title: "Select MindFlow file" }
  );
  return selected?.file ?? latest;
}

async function pickMindFlowFile(repository: FlowRepository): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: "Open MindFlow",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(repository.directoryPath),
    filters: {
      "MindFlow": ["mindflow"],
      "All Files": ["*"]
    }
  });
  return picked?.[0]?.fsPath;
}

async function rememberRecentFlow(
  context: vscode.ExtensionContext,
  sidebarView: SidebarView | undefined,
  flowPath: string
): Promise<void> {
  currentFlowPath = flowPath;
  await new RecentFlowStore(context.workspaceState).add(flowPath);
  void sidebarView?.refresh();
}

function isMindFlowDocument(document: vscode.TextDocument): boolean {
  return isRealMindFlowUri(document.uri) && path.extname(document.uri.fsPath) === ".mindflow";
}

function isRealMindFlowUri(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && Boolean(uri.fsPath && path.isAbsolute(uri.fsPath));
}

function createFlowRepository(): FlowRepository {
  const flowDirectory = vscode.workspace.getConfiguration("mindflow.storage").get<string>("flowDirectory", ".mindflow/flows");
  return new FlowRepository(getWorkspaceRoot(), flowDirectory);
}

function getWorkspaceRoot(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error("MindFlow requires an open workspace folder.");
  }
  return folder.uri.fsPath;
}

function latestStaleChangeSetId(flow: ProductFlow, nodeId: string): string | undefined {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  const artifactIds = new Set([...(node?.artifacts.prdIds ?? []), ...(node?.artifacts.pencilIds ?? [])]);
  const refs = [
    ...flow.artifacts.prds.filter((ref) => artifactIds.has(ref.prdId)),
    ...flow.artifacts.pencils.filter((ref) => artifactIds.has(ref.pencilId))
  ];
  return refs.find((ref) => ref.status === "stale")?.staleByChangeSetId;
}

function markNodePrdActive(flow: ProductFlow, nodeId: string, prdId: string): void {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  const ref = flow.artifacts.prds.find((item) => item.prdId === prdId);
  if (node && ref) {
    if (!node.artifacts.prdIds.includes(prdId)) {
      node.artifacts.prdIds.push(prdId);
    }
    ref.status = "active";
    ref.staleReason = undefined;
  }
}

function markNodePencilActive(flow: ProductFlow, nodeId: string, pencilId: string): void {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  const ref = flow.artifacts.pencils.find((item) => item.pencilId === pencilId);
  if (node && ref) {
    if (!node.artifacts.pencilIds.includes(pencilId)) {
      node.artifacts.pencilIds.push(pencilId);
    }
    ref.status = "active";
    ref.staleReason = undefined;
  }
}

type TaxonomyKind = "appSurface" | "domain" | "role" | "statusGroup";
type TaxonomyAction = "create" | "update" | "delete";

interface TaxonomyRequest {
  kind: TaxonomyKind;
  action: TaxonomyAction;
  id?: string;
  item?: Record<string, unknown>;
}

function applyTaxonomyRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  switch (request.kind) {
    case "appSurface":
      applyAppSurfaceRequest(flow, request);
      break;
    case "domain":
      applyDomainRequest(flow, request);
      break;
    case "role":
      applyRoleRequest(flow, request);
      break;
    case "statusGroup":
      applyStatusGroupRequest(flow, request);
      break;
    default:
      throw new Error(`Unsupported taxonomy kind: ${String(request.kind)}`);
  }
  flow.revision += 1;
  flow.updatedAt = nowIso();
}

function applyAppSurfaceRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  flow.appSurfaces = flow.appSurfaces ?? [];
  if (request.action === "delete") {
    const appId = requireRequestId(request);
    deleteAppSurface(flow, appId);
    return;
  }
  const item = request.item ?? {};
  const requestedAppId = request.id ?? readOptionalString(item.appId);
  const existing = requestedAppId ? flow.appSurfaces.find((item) => item.appId === requestedAppId) : undefined;
  const name = readString(item.name, existing?.name ?? "新应用端");
  const appId = requestedAppId ?? makeTaxonomyId("app", name);
  const next: AppSurface = {
    appId,
    name,
    type: normalizeSurfaceType(readString(item.type, "other")),
    description: readString(item.description, ""),
    domainIds: readStringArray(item.domainIds),
    roleIds: readStringArray(item.roleIds),
    view: existing?.view
  };
  upsertById(flow.appSurfaces, (item) => item.appId, next);
}

function applyDomainRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  if (request.action === "delete") {
    const domainId = requireRequestId(request);
    flow.domains = flow.domains.filter((item) => item.domainId !== domainId);
    for (const role of flow.roles) {
      role.domainIds = role.domainIds.filter((id) => id !== domainId);
    }
    for (const app of flow.appSurfaces ?? []) {
      app.domainIds = app.domainIds.filter((id) => id !== domainId);
    }
    for (const node of flow.nodes) {
      node.domainIds = node.domainIds.filter((id) => id !== domainId);
    }
    for (const edge of flow.edges) {
      edge.domainIds = edge.domainIds.filter((id) => id !== domainId);
    }
    return;
  }
  const item = request.item ?? {};
  const requestedDomainId = request.id ?? readOptionalString(item.domainId);
  const existing = requestedDomainId ? flow.domains.find((item) => item.domainId === requestedDomainId) : undefined;
  const name = readString(item.name, existing?.name ?? "新业务域");
  const domainId = requestedDomainId ?? makeTaxonomyId("domain", name);
  const next: BusinessDomain = {
    domainId,
    name,
    description: readString(item.description, "")
  };
  upsertById(flow.domains, (item) => item.domainId, next);
}

function applyRoleRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  if (request.action === "delete") {
    const roleId = requireRequestId(request);
    flow.roles = flow.roles.filter((item) => item.roleId !== roleId);
    for (const app of flow.appSurfaces ?? []) {
      app.roleIds = app.roleIds.filter((id) => id !== roleId);
    }
    for (const node of flow.nodes) {
      node.roleIds = node.roleIds.filter((id) => id !== roleId);
      node.permissions = node.permissions.filter((id) => id !== roleId);
    }
    for (const edge of flow.edges) {
      edge.roleIds = edge.roleIds.filter((id) => id !== roleId);
    }
    return;
  }
  const item = request.item ?? {};
  const requestedRoleId = request.id ?? readOptionalString(item.roleId);
  const existing = requestedRoleId ? flow.roles.find((item) => item.roleId === requestedRoleId) : undefined;
  const name = readString(item.name, existing?.name ?? "新角色");
  const roleId = requestedRoleId ?? makeTaxonomyId("role", name);
  const next: UserRole = {
    roleId,
    name,
    description: readString(item.description, ""),
    domainIds: readStringArray(item.domainIds)
  };
  upsertById(flow.roles, (item) => item.roleId, next);
}

function applyStatusGroupRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  flow.statusGroups = flow.statusGroups ?? [];
  if (request.action === "delete") {
    const statusGroupId = requireRequestId(request);
    flow.statusGroups = flow.statusGroups.filter((item) => item.statusGroupId !== statusGroupId);
    for (const node of flow.nodes) {
      if (node.statusGroupId === statusGroupId) {
        delete node.statusGroupId;
      }
    }
    return;
  }
  const item = request.item ?? {};
  const requestedStatusGroupId = request.id ?? readOptionalString(item.statusGroupId);
  const existing = requestedStatusGroupId ? flow.statusGroups.find((item) => item.statusGroupId === requestedStatusGroupId) : undefined;
  const title = readString(item.title ?? item.name, existing?.title ?? "新状态组");
  const statusGroupId = requestedStatusGroupId ?? makeTaxonomyId("status", title);
  const requestedColor = readStatusGroupColor(item.color, existing?.color ?? randomStatusGroupColor(flow.statusGroups, statusGroupId));
  const next: ProductStatusGroup = {
    statusGroupId,
    title,
    color: uniqueStatusGroupColor(requestedColor, flow.statusGroups, statusGroupId)
  };
  upsertById(flow.statusGroups, (item) => item.statusGroupId, next);
}

function upsertById<T>(items: T[], getId: (item: T) => string, next: T): void {
  const nextId = getId(next);
  const index = items.findIndex((item) => getId(item) === nextId);
  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }
}

function requireRequestId(request: TaxonomyRequest): string {
  if (!request.id) {
    throw new Error("Taxonomy delete requires id.");
  }
  return request.id;
}

function makeTaxonomyId(prefix: string, name: string): string {
  return `${prefix}_${slugify(name, prefix)}_${shortHash(`${name}:${Date.now()}`, 6)}`;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function readStatusGroupColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

function uniqueStatusGroupColor(color: string, groups: ProductStatusGroup[], currentId: string): string {
  return statusGroupColorExists(color, groups, currentId) ? randomStatusGroupColor(groups, currentId) : color;
}

function statusGroupColorExists(color: string, groups: ProductStatusGroup[], currentId: string): boolean {
  const normalized = color.toLowerCase();
  return groups.some((group) =>
    group.statusGroupId !== currentId &&
    readStatusGroupColor(group.color, "").toLowerCase() === normalized
  );
}

function randomStatusGroupColor(groups: ProductStatusGroup[] = [], currentId = ""): string {
  const usedColors = new Set(
    groups
      .filter((group) => group.statusGroupId !== currentId)
      .map((group) => readStatusGroupColor(group.color, "").toLowerCase())
      .filter(Boolean)
  );
  const seed = Math.floor(Math.random() * 0x1000000);
  for (let attempt = 0; attempt < 0x1000000; attempt += 1) {
    const value = (seed + attempt * 9973) % 0x1000000;
    const color = `#${value.toString(16).padStart(6, "0")}`;
    if (!usedColors.has(color)) {
      return color;
    }
  }
  return "#000000";
}

function normalizeSurfaceType(value: string): AppSurface["type"] {
  return value === "admin" || value === "web" || value === "app" || value === "miniapp" || value === "desktop" || value === "other"
    ? value
    : "other";
}

function showError(prefix: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(`${prefix}: ${message}`);
}
