import type { ProductFlow } from "./types";
import { createDefaultProjectOverview } from "./projectOverviewDefaults";
import { makeFlowId, nowIso } from "../id";

export function createEmptyProductFlow(title = "Untitled MindFlow"): ProductFlow {
  const now = nowIso();
  return {
    flowId: makeFlowId(title),
    revision: 1,
    title,
    createdAt: now,
    updatedAt: now,
    projectOverview: createDefaultProjectOverview("Manually created blank MindFlow."),
    domains: [],
    roles: [],
    appSurfaces: [],
    statusGroups: [],
    nodes: [],
    edges: []
  };
}
