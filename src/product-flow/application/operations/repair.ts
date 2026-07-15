import { pruneMissingAppSurfaceReferences } from "../../domain/editing/taxonomy/referenceCleanup";
import { ensureAppSurfaceEntryEdges } from "../../domain/editing/layout/appSurfaceEntryEdges";
import type { ProductFlow } from "../../domain";

export function repairFlowReferencesBeforeSave(flow: ProductFlow): void {
  pruneMissingAppSurfaceReferences(flow);
  ensureAppSurfaceEntryEdges(flow);
}
