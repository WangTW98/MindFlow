import { PROJECT_OVERVIEW_NODE_ID, updateProjectOverview, updateProjectOverviewPosition } from "../../domain/editing/projectOverviewMutations";
import type { ProductFlow } from "../../domain";
import type { FlowOperation, FlowOperationResult } from "./types";

type ProjectOperation = Extract<FlowOperation, { type: "project.update" | "project.move" }>;

export function applyProjectOperation(flow: ProductFlow, operation: ProjectOperation): FlowOperationResult {
  if (operation.type === "project.update") {
    updateProjectOverview(flow, operation.patch);
    return {
      type: operation.type,
      root: rootPayload(flow),
      selection: { selectedProjectOverview: true }
    };
  }
  updateProjectOverviewPosition(flow, operation.x, operation.y);
  return { type: operation.type, root: rootPayload(flow) };
}

function rootPayload(flow: ProductFlow): Record<string, unknown> {
  return {
    nodeId: PROJECT_OVERVIEW_NODE_ID,
    title: flow.title,
    projectOverview: flow.projectOverview
  };
}
