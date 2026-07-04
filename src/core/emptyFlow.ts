import type { ProductFlow } from "../models/productFlow";
import { makeFlowId, nowIso } from "../utils/id";

export function createEmptyProductFlow(title = "Untitled MindFlow"): ProductFlow {
  const now = nowIso();
  return {
    schemaVersion: "1.0",
    flowId: makeFlowId(title),
    revision: 1,
    title,
    sourceDocumentId: "manual",
    sourceSummary: "Manually created blank MindFlow.",
    createdAt: now,
    updatedAt: now,
    domains: [],
    roles: [],
    appSurfaces: [],
    statusGroups: [],
    nodes: [],
    edges: [],
    artifacts: {
      prds: [],
      pencils: []
    },
    changeHistory: [],
    syncState: {
      issues: []
    },
    productDesignIssues: [],
    openQuestions: []
  };
}
