import type { TaxonomyKind } from "../../domain/editing/taxonomy";
import type { FlowSelectionPatch } from "../../domain/selection";
import type { FlowOperationResult } from "./types";

export function combineSelection(results: readonly FlowOperationResult[]): FlowSelectionPatch | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    const selection = result && "selection" in result ? result.selection : undefined;
    if (selection) {
      return selection;
    }
  }
  return undefined;
}

export function nodeSelectionPatch(nodeId: string): FlowSelectionPatch {
  return { selectedProjectOverview: false, selectedNodeId: nodeId, selectedNodeIds: [nodeId] };
}

export function taxonomySelectionPatch(kind: TaxonomyKind, id: string | undefined): FlowSelectionPatch {
  const base = { selectedProjectOverview: false };
  if (kind === "appSurface") {
    return { ...base, selectedAppSurfaceId: id };
  }
  if (kind === "domain") {
    return { ...base, selectedDomainId: id };
  }
  if (kind === "role") {
    return { ...base, selectedRoleId: id };
  }
  return { ...base, selectedStatusGroupId: id };
}
