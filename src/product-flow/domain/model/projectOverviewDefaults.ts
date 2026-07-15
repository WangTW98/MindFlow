import type { ProductFlow, ProjectOverview } from "./types";

const DEFAULT_PROJECT_SUMMARY = "Manually created blank MindFlow.";

export interface EnsureProjectOverviewResult {
  overview: ProjectOverview;
  changed: boolean;
}

export function createDefaultProjectOverview(summary = DEFAULT_PROJECT_SUMMARY): ProjectOverview {
  return {
    summary: sanitizeOptionalText(summary) || DEFAULT_PROJECT_SUMMARY,
    goal: ""
  };
}

export function ensureProjectOverview(flow: ProductFlow): EnsureProjectOverviewResult {
  if (!flow || typeof flow !== "object" || Array.isArray(flow) || !flow.projectOverview || typeof flow.projectOverview !== "object") {
    throw new Error("ProductFlow.projectOverview is required.");
  }
  const current = flow.projectOverview;
  if (typeof current.summary !== "string" || typeof current.goal !== "string") {
    throw new Error("ProductFlow.projectOverview must use the current MindFlow structure.");
  }
  return { overview: current, changed: false };
}

function sanitizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
