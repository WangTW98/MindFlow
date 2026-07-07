import type { ProductFlow } from "./types";
import { createDefaultProjectOverview } from "./projectOverview";
import { makeFlowId, nowIso } from "../id";

export function createEmptyProductFlow(title = "Untitled MindFlow"): ProductFlow {
  const now = nowIso();
  return {
    schemaVersion: "2.0",
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
