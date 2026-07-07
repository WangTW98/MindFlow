import type { ProductFlow, ProjectOverview } from "..";
import {
  createDefaultProjectOverview,
  ensureProjectOverview,
  type EnsureProjectOverviewResult
} from "../model/projectOverviewDefaults";
import { nowIso } from "../id";

export const PROJECT_OVERVIEW_NODE_ID = "projectOverview";

export {
  createDefaultProjectOverview,
  ensureProjectOverview,
  type EnsureProjectOverviewResult
};

export interface UpdateProjectOverviewInput {
  title?: string;
  summary?: string;
  goal?: string;
}

export function updateProjectOverview(flow: ProductFlow, patch: UpdateProjectOverviewInput): ProjectOverview {
  const { overview } = ensureProjectOverview(flow);
  if (patch.title !== undefined) {
    flow.title = sanitizeRequiredText(patch.title, flow.title);
  }
  if (patch.summary !== undefined) {
    overview.summary = sanitizeOptionalText(patch.summary) || overview.summary;
  }
  if (patch.goal !== undefined) {
    overview.goal = sanitizeOptionalText(patch.goal);
  }
  flow.revision += 1;
  flow.updatedAt = nowIso();
  return overview;
}

export function updateProjectOverviewPosition(flow: ProductFlow, x: number, y: number): ProjectOverview {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Project overview position coordinates must be finite numbers.");
  }
  const { overview } = ensureProjectOverview(flow);
  overview.view = {
    ...overview.view,
    position: {
      x: Math.round(x),
      y: Math.round(y)
    }
  };
  flow.revision += 1;
  flow.updatedAt = nowIso();
  return overview;
}

function sanitizeRequiredText(value: unknown, fallback: string): string {
  const text = sanitizeOptionalText(value);
  return text || fallback;
}

function sanitizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
