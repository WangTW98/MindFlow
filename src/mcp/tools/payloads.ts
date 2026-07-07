import { normalizeFlowSelection, type FlowSelectionPatch } from "../../state/selection";
import type { FlowOperationResult } from "../../state/operations";
import { PROJECT_OVERVIEW_NODE_ID } from "../../state/operations";
import type { PageNode, ProductFlow } from "../../state/product-flow";
import type { MindFlowEditorSnapshot } from "../bridge";

export function buildHydratedSelection(snapshot: MindFlowEditorSnapshot): Record<string, unknown> {
  const flow = snapshot.flow;
  const selection = normalizeFlowSelection(snapshot.selection);
  return {
    selectedRoot: selection.selectedProjectOverview ? rootPayload(flow) : undefined,
    selectedNodes: selection.selectedNodeIds.map((nodeId) => flow.nodes.find((node) => node.nodeId === nodeId)).filter((node): node is PageNode => Boolean(node)),
    selectedNode: selection.selectedNodeId ? flow.nodes.find((node) => node.nodeId === selection.selectedNodeId) : undefined,
    selectedEdge: selection.selectedEdgeId ? flow.edges.find((edge) => edge.edgeId === selection.selectedEdgeId) : undefined,
    selectedAppSurface: selection.selectedAppSurfaceId ? flow.appSurfaces?.find((surface) => surface.appId === selection.selectedAppSurfaceId) : undefined,
    selectedDomain: selection.selectedDomainId ? flow.domains.find((domain) => domain.domainId === selection.selectedDomainId) : undefined,
    selectedRole: selection.selectedRoleId ? flow.roles.find((role) => role.roleId === selection.selectedRoleId) : undefined,
    selectedStatusGroup: selection.selectedStatusGroupId ? flow.statusGroups?.find((group) => group.statusGroupId === selection.selectedStatusGroupId) : undefined
  };
}

export function buildSelectionIssues(snapshot: MindFlowEditorSnapshot): Array<Record<string, string>> {
  const flow = snapshot.flow;
  const selection = normalizeFlowSelection(snapshot.selection);
  const issues: Array<Record<string, string>> = [];
  for (const nodeId of selection.selectedNodeIds) {
    if (!flow.nodes.some((node) => node.nodeId === nodeId)) {
      issues.push(selectionIssue("selectedNodeIds", nodeId, "Selected node is missing."));
    }
  }
  if (selection.selectedNodeId && !flow.nodes.some((node) => node.nodeId === selection.selectedNodeId)) {
    issues.push(selectionIssue("selectedNodeId", selection.selectedNodeId, "Selected node is missing."));
  }
  if (selection.selectedEdgeId && !flow.edges.some((edge) => edge.edgeId === selection.selectedEdgeId)) {
    issues.push(selectionIssue("selectedEdgeId", selection.selectedEdgeId, "Selected edge is missing."));
  }
  if (selection.selectedAppSurfaceId && !flow.appSurfaces?.some((surface) => surface.appId === selection.selectedAppSurfaceId)) {
    issues.push(selectionIssue("selectedAppSurfaceId", selection.selectedAppSurfaceId, "Selected app surface is missing."));
  }
  if (selection.selectedDomainId && !flow.domains.some((domain) => domain.domainId === selection.selectedDomainId)) {
    issues.push(selectionIssue("selectedDomainId", selection.selectedDomainId, "Selected domain is missing."));
  }
  if (selection.selectedRoleId && !flow.roles.some((role) => role.roleId === selection.selectedRoleId)) {
    issues.push(selectionIssue("selectedRoleId", selection.selectedRoleId, "Selected role is missing."));
  }
  if (selection.selectedStatusGroupId && !flow.statusGroups?.some((group) => group.statusGroupId === selection.selectedStatusGroupId)) {
    issues.push(selectionIssue("selectedStatusGroupId", selection.selectedStatusGroupId, "Selected status group is missing."));
  }
  return issues;
}

export function operationPayload(result: FlowOperationResult): Record<string, unknown> {
  switch (result.type) {
    case "project.update":
    case "project.move":
      return { root: result.root };
    case "taxonomy.upsert":
      return { taxonomy: result.taxonomy };
    case "taxonomy.remove":
      return { taxonomy: result.taxonomy, removedId: result.removedId };
    case "appSurface.move":
      return { appSurface: result.appSurface };
    case "node.create":
    case "node.update":
    case "node.move":
      return { node: result.node };
    case "node.remove":
      return { removedNodeId: result.removedNodeId, removedEdgeIds: result.removedEdgeIds };
    case "node.createConnected":
      return { node: result.node, edge: result.edge };
    case "edge.upsert":
      return { edge: result.edge, mode: result.mode };
    case "edge.update":
      return { edge: result.edge };
    case "edge.remove":
      return { removedEdgeId: result.removedEdgeId };
  }
}

export function resultNodes(results: readonly FlowOperationResult[]): PageNode[] {
  return results.flatMap((result) =>
    result.type === "node.create" || result.type === "node.update" || result.type === "node.move" || result.type === "node.createConnected"
      ? [result.node]
      : []
  );
}

export function batchSelectionPatch(nodes: PageNode[], selectResultNodes: boolean): FlowSelectionPatch | undefined {
  if (!selectResultNodes) {
    return undefined;
  }
  const selectedNodeIds = nodes.map((node) => node.nodeId);
  return selectedNodeIds.length > 0
    ? { selectedProjectOverview: false, selectedNodeId: selectedNodeIds[selectedNodeIds.length - 1], selectedNodeIds }
    : undefined;
}

export function rootPayload(flow: ProductFlow): Record<string, unknown> {
  return {
    nodeId: PROJECT_OVERVIEW_NODE_ID,
    title: flow.title,
    projectOverview: flow.projectOverview
  };
}

export function snapshotToPayload(snapshot: MindFlowEditorSnapshot): Record<string, unknown> {
  return {
    uri: snapshot.uri,
    path: snapshot.path,
    displayName: snapshot.displayName,
    active: snapshot.active,
    dirty: snapshot.dirty,
    revision: snapshot.flow.revision,
    title: snapshot.flow.title
  };
}

function selectionIssue(field: string, id: string, message: string): Record<string, string> {
  return { field, id, message };
}
