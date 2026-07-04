import type { FlowChangePlan, FlowOperation } from "../models/flowChange";
import type { FlowEdge, PageAction, PageElement, PageNode, ProductFlow } from "../models/productFlow";
import { validateFlowChangePlan } from "../models/flowChange";
import { validateProductFlow } from "../models/productFlow";
import { nowIso } from "../utils/id";

export interface ApplyChangeOptions {
  confirmedDestructive?: boolean;
}

export function applyFlowChangePlan(flow: ProductFlow, plan: FlowChangePlan, options: ApplyChangeOptions = {}): ProductFlow {
  const planValidation = validateFlowChangePlan(plan);
  if (!planValidation.valid) {
    throw new Error(`Invalid FlowChangePlan:\n${planValidation.errors.join("\n")}`);
  }
  if (plan.flowId !== flow.flowId) {
    throw new Error(`ChangeSet ${plan.changeSetId} targets ${plan.flowId}, not ${flow.flowId}.`);
  }
  if (plan.baseRevision !== flow.revision) {
    throw new Error(`ChangeSet base revision ${plan.baseRevision} does not match current revision ${flow.revision}.`);
  }
  if (plan.requiresClarification) {
    throw new Error(`ChangeSet requires clarification: ${plan.openQuestions.join("; ")}`);
  }
  if (!options.confirmedDestructive && plan.operations.some((operation) => operation.requiresConfirmation)) {
    throw new Error("ChangeSet contains destructive operations that require confirmation.");
  }

  const next = clone(flow);
  for (const operation of plan.operations) {
    applyOperation(next, plan.changeSetId, operation);
  }
  markImpactedArtifacts(next, plan);
  next.revision += 1;
  next.updatedAt = nowIso();
  next.changeHistory.push({
    changeSetId: plan.changeSetId,
    baseRevision: flow.revision,
    appliedRevision: next.revision,
    instruction: plan.instruction,
    intent: plan.intent,
    operationCount: plan.operations.length,
    affectedNodeIds: plan.affectedNodeIds,
    affectedEdgeIds: plan.affectedEdgeIds,
    appliedAt: nowIso(),
    operations: plan.operations
  });

  const validation = validateProductFlow(next);
  if (!validation.valid) {
    throw new Error(`ProductFlow invalid after applying ChangeSet:\n${validation.errors.join("\n")}`);
  }
  return next;
}

function applyOperation(flow: ProductFlow, changeSetId: string, operation: FlowOperation): void {
  switch (operation.type) {
    case "addNode":
      addNode(flow, operation.after as PageNode, changeSetId);
      break;
    case "updateNode":
      updateNode(flow, operation.target.nodeId, operation.after as Partial<PageNode>, changeSetId);
      break;
    case "removeNode":
      softRemoveNode(flow, operation.target.nodeId, changeSetId);
      break;
    case "addEdge":
      addEdge(flow, operation.after as FlowEdge, changeSetId);
      break;
    case "updateEdge":
    case "rewireEdge":
      updateEdge(flow, operation.target.edgeId, operation.after as Partial<FlowEdge>, changeSetId);
      break;
    case "removeEdge":
      softRemoveEdge(flow, operation.target.edgeId, changeSetId);
      break;
    case "addElement":
      addElement(flow, operation.target.nodeId, operation.after as PageElement, changeSetId);
      break;
    case "updateElement":
      updateElement(flow, operation.target.nodeId, operation.target.elementId, operation.after as Partial<PageElement>, changeSetId);
      break;
    case "removeElement":
      removeElement(flow, operation.target.nodeId, operation.target.elementId, changeSetId);
      break;
    case "addAction":
      addAction(flow, operation.target.nodeId, operation.after as PageAction, changeSetId);
      break;
    case "updateAction":
      updateAction(flow, operation.target.nodeId, operation.target.actionId, operation.after as Partial<PageAction>, changeSetId);
      break;
    case "removeAction":
      removeAction(flow, operation.target.nodeId, operation.target.actionId, changeSetId);
      break;
    case "markArtifactStale":
      markSingleArtifactStale(flow, operation.target.artifactId, changeSetId, operation.reason);
      break;
    case "splitNode":
    case "mergeNodes":
      applyCompositeOperation(flow, operation, changeSetId);
      break;
    default:
      assertNever(operation.type);
  }
}

function addNode(flow: ProductFlow, node: PageNode, changeSetId: string): void {
  if (!node?.nodeId) {
    throw new Error("addNode operation requires after.nodeId.");
  }
  if (flow.nodes.some((item) => item.nodeId === node.nodeId)) {
    throw new Error(`Node already exists: ${node.nodeId}`);
  }
  flow.nodes.push({
    ...node,
    status: node.status ?? "active",
    version: node.version ?? 1,
    createdByChangeSetId: node.createdByChangeSetId ?? changeSetId,
    updatedByChangeSetId: changeSetId
  });
}

function updateNode(flow: ProductFlow, nodeId: string | undefined, patch: Partial<PageNode>, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  Object.assign(node, patch, {
    nodeId: node.nodeId,
    version: node.version + 1,
    updatedByChangeSetId: changeSetId
  });
}

function softRemoveNode(flow: ProductFlow, nodeId: string | undefined, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  node.status = "removed";
  node.version += 1;
  node.removedAt = nowIso();
  node.removedByChangeSetId = changeSetId;
  node.updatedByChangeSetId = changeSetId;
  for (const edge of flow.edges.filter((item) => item.fromNodeId === node.nodeId || item.toNodeId === node.nodeId)) {
    if (edge.status !== "removed") {
      softRemoveEdge(flow, edge.edgeId, changeSetId);
    }
  }
}

function addEdge(flow: ProductFlow, edge: FlowEdge, changeSetId: string): void {
  if (!edge?.edgeId) {
    throw new Error("addEdge operation requires after.edgeId.");
  }
  if (flow.edges.some((item) => item.edgeId === edge.edgeId)) {
    throw new Error(`Edge already exists: ${edge.edgeId}`);
  }
  requireNode(flow, edge.fromNodeId);
  requireNode(flow, edge.toNodeId);
  flow.edges.push({
    ...edge,
    status: edge.status ?? "active",
    createdByChangeSetId: edge.createdByChangeSetId ?? changeSetId,
    updatedByChangeSetId: changeSetId
  });
}

function updateEdge(flow: ProductFlow, edgeId: string | undefined, patch: Partial<FlowEdge>, changeSetId: string): void {
  const edge = requireEdge(flow, edgeId);
  if (patch.fromNodeId) {
    requireNode(flow, patch.fromNodeId);
  }
  if (patch.toNodeId) {
    requireNode(flow, patch.toNodeId);
  }
  Object.assign(edge, patch, {
    edgeId: edge.edgeId,
    updatedByChangeSetId: changeSetId
  });
}

function softRemoveEdge(flow: ProductFlow, edgeId: string | undefined, changeSetId: string): void {
  const edge = requireEdge(flow, edgeId);
  edge.status = "removed";
  edge.removedAt = nowIso();
  edge.removedByChangeSetId = changeSetId;
  edge.updatedByChangeSetId = changeSetId;
}

function addElement(flow: ProductFlow, nodeId: string | undefined, element: PageElement, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  if (node.elements.some((item) => item.elementId === element.elementId)) {
    throw new Error(`Element already exists: ${element.elementId}`);
  }
  node.elements.push(element);
  touchNode(node, changeSetId);
}

function updateElement(flow: ProductFlow, nodeId: string | undefined, elementId: string | undefined, patch: Partial<PageElement>, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  const element = node.elements.find((item) => item.elementId === elementId);
  if (!element) {
    throw new Error(`Missing element: ${elementId ?? ""}`);
  }
  Object.assign(element, patch, { elementId: element.elementId });
  touchNode(node, changeSetId);
}

function removeElement(flow: ProductFlow, nodeId: string | undefined, elementId: string | undefined, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  node.elements = node.elements.filter((item) => item.elementId !== elementId);
  touchNode(node, changeSetId);
}

function addAction(flow: ProductFlow, nodeId: string | undefined, action: PageAction, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  if (node.actions.some((item) => item.actionId === action.actionId)) {
    throw new Error(`Action already exists: ${action.actionId}`);
  }
  node.actions.push(action);
  touchNode(node, changeSetId);
}

function updateAction(flow: ProductFlow, nodeId: string | undefined, actionId: string | undefined, patch: Partial<PageAction>, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  const action = node.actions.find((item) => item.actionId === actionId);
  if (!action) {
    throw new Error(`Missing action: ${actionId ?? ""}`);
  }
  Object.assign(action, patch, { actionId: action.actionId });
  touchNode(node, changeSetId);
}

function removeAction(flow: ProductFlow, nodeId: string | undefined, actionId: string | undefined, changeSetId: string): void {
  const node = requireNode(flow, nodeId);
  node.actions = node.actions.filter((item) => item.actionId !== actionId);
  touchNode(node, changeSetId);
}

function applyCompositeOperation(flow: ProductFlow, operation: FlowOperation, changeSetId: string): void {
  const after = operation.after;
  if (!isRecord(after)) {
    return;
  }
  const record = after as Record<string, unknown>;
  const nodes = record["nodes"];
  const edges = record["edges"];
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      addNode(flow, node as PageNode, changeSetId);
    }
  }
  if (Array.isArray(edges)) {
    for (const edge of edges) {
      addEdge(flow, edge as FlowEdge, changeSetId);
    }
  }
  if (operation.type === "mergeNodes") {
    for (const nodeId of operation.target.nodeIds ?? []) {
      softRemoveNode(flow, nodeId, changeSetId);
    }
  }
}

function markImpactedArtifacts(flow: ProductFlow, plan: FlowChangePlan): void {
  for (const nodeId of plan.affectedNodeIds) {
    const node = flow.nodes.find((item) => item.nodeId === nodeId);
    if (!node) {
      continue;
    }
    for (const prdId of node.artifacts.prdIds) {
      markSingleArtifactStale(flow, prdId, plan.changeSetId, `节点 ${node.title} 已变更。`);
    }
    for (const pencilId of node.artifacts.pencilIds) {
      markSingleArtifactStale(flow, pencilId, plan.changeSetId, `节点 ${node.title} 已变更。`);
    }
  }
  for (const impact of plan.artifactImpact) {
    if (impact.status === "stale" || impact.status === "needsRegeneration") {
      markSingleArtifactStale(flow, impact.artifactId, plan.changeSetId, impact.reason);
    }
  }
}

function markSingleArtifactStale(flow: ProductFlow, artifactId: string | undefined, changeSetId: string, reason: string): void {
  if (!artifactId) {
    return;
  }
  const prd = flow.artifacts.prds.find((item) => item.prdId === artifactId);
  if (prd) {
    prd.status = "stale";
    prd.staleReason = reason;
    prd.staleByChangeSetId = changeSetId;
    prd.updatedAt = nowIso();
  }
  const pencil = flow.artifacts.pencils.find((item) => item.pencilId === artifactId);
  if (pencil) {
    pencil.status = "stale";
    pencil.staleReason = reason;
    pencil.staleByChangeSetId = changeSetId;
    pencil.updatedAt = nowIso();
  }
}

function touchNode(node: PageNode, changeSetId: string): void {
  node.version += 1;
  node.updatedByChangeSetId = changeSetId;
}

function requireNode(flow: ProductFlow, nodeId: string | undefined): PageNode {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new Error(`Missing node: ${nodeId ?? ""}`);
  }
  return node;
}

function requireEdge(flow: ProductFlow, edgeId: string | undefined): FlowEdge {
  const edge = flow.edges.find((item) => item.edgeId === edgeId);
  if (!edge) {
    throw new Error(`Missing edge: ${edgeId ?? ""}`);
  }
  return edge;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unsupported operation type: ${String(value)}`);
}
