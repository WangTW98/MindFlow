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
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) {
    return { overview: createDefaultProjectOverview(), changed: false };
  }
  const current = flow.projectOverview;
  const currentSummary = sanitizeOptionalText(current?.summary);
  const legacySourceSummary = sanitizeOptionalText((flow as unknown as Record<string, unknown>).sourceSummary);
  const summary = currentSummary && currentSummary !== DEFAULT_PROJECT_SUMMARY
    ? currentSummary
    : legacySourceSummary || currentSummary || DEFAULT_PROJECT_SUMMARY;
  const goal = typeof current?.goal === "string" ? current.goal.trim() : "";
  const position = normalizePosition(current?.view?.position);
  const next: ProjectOverview = {
    summary,
    goal,
    ...(position ? { view: { position } } : {})
  };
  const changed = !sameProjectOverview(current, next);
  flow.projectOverview = next;
  return { overview: next, changed };
}

function normalizePosition(position: unknown): { x: number; y: number } | undefined {
  if (!position || typeof position !== "object") {
    return undefined;
  }
  const candidate = position as { x?: unknown; y?: unknown };
  return typeof candidate.x === "number" && typeof candidate.y === "number" && Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
    ? { x: Math.round(candidate.x), y: Math.round(candidate.y) }
    : undefined;
}

function sameProjectOverview(left: ProjectOverview | undefined, right: ProjectOverview): boolean {
  if (!left) {
    return false;
  }
  const leftPosition = normalizePosition(left.view?.position);
  const rightPosition = normalizePosition(right.view?.position);
  return left.summary === right.summary &&
    left.goal === right.goal &&
    leftPosition?.x === rightPosition?.x &&
    leftPosition?.y === rightPosition?.y;
}

function sanitizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
