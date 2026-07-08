import { pruneMissingAppSurfaceReferences } from "../../domain/editing/taxonomy/referenceCleanup";
import type { ProductFlow } from "../../domain";

export function repairFlowReferencesBeforeSave(flow: ProductFlow): void {
  pruneMissingAppSurfaceReferences(flow);
}
