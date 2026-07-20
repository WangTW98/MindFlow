import type { ProductFlow } from "../../domain";
import { applyEdgeOperation } from "./edges";
import { applyNodeOperation } from "./nodes";
import { applyProjectOperation } from "./project";
import { combineSelection } from "./selection";
import { applyTaxonomyOperation } from "./taxonomy";
import type { ApplyFlowOperationsOptions, ApplyFlowOperationsResult, FlowOperation, FlowOperationResult } from "./types";

export function applyFlowOperation(flow: ProductFlow, operation: FlowOperation): FlowOperationResult {
  switch (operation.type) {
    case "project.update":
    case "project.move":
      return applyProjectOperation(flow, operation);
    case "taxonomy.upsert":
    case "taxonomy.remove":
      return applyTaxonomyOperation(flow, operation);
    case "appSurface.move":
    case "node.create":
    case "node.paste":
    case "node.update":
    case "node.move":
    case "node.remove":
    case "node.createConnected":
      return applyNodeOperation(flow, operation);
    case "edge.upsert":
    case "edge.update":
    case "edge.remove":
      return applyEdgeOperation(flow, operation);
  }
}

export function applyFlowOperations(
  flow: ProductFlow,
  operations: readonly FlowOperation[],
  options: ApplyFlowOperationsOptions = {}
): ApplyFlowOperationsResult {
  const dryRun = options.dryRun === true;
  const target = options.atomic || dryRun ? cloneProductFlow(flow) : flow;
  const results = operations.map((operation) => applyFlowOperation(target, operation));
  return {
    flow: target,
    results,
    applied: !dryRun,
    dryRun,
    selection: combineSelection(results)
  };
}

export function cloneProductFlow(flow: ProductFlow): ProductFlow {
  return JSON.parse(JSON.stringify(flow)) as ProductFlow;
}
