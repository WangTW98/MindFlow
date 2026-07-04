import type { FlowChangePlan, FlowOperation } from "../models/flowChange";

export interface ChangeDiffSummary {
  added: FlowOperation[];
  changed: FlowOperation[];
  removed: FlowOperation[];
  staleArtifacts: string[];
  destructiveOperationCount: number;
  text: string;
}

export function summarizeChangePlan(plan: FlowChangePlan): ChangeDiffSummary {
  const added = plan.operations.filter((operation) => operation.type.startsWith("add"));
  const removed = plan.operations.filter((operation) => operation.type.startsWith("remove"));
  const changed = plan.operations.filter((operation) => !added.includes(operation) && !removed.includes(operation));
  const destructiveOperationCount = plan.operations.filter((operation) => operation.requiresConfirmation).length;
  const staleArtifacts = plan.artifactImpact
    .filter((impact) => impact.status === "stale" || impact.status === "needsRegeneration")
    .map((impact) => `${impact.artifactType}:${impact.artifactId}`);

  return {
    added,
    changed,
    removed,
    staleArtifacts,
    destructiveOperationCount,
    text: [
      `ChangeSet: ${plan.changeSetId}`,
      `Intent: ${plan.intent}`,
      `Instruction: ${plan.instruction}`,
      `Operations: ${plan.operations.length}`,
      `Added: ${added.length}`,
      `Changed: ${changed.length}`,
      `Removed: ${removed.length}`,
      `Affected nodes: ${plan.affectedNodeIds.join(", ") || "none"}`,
      `Affected edges: ${plan.affectedEdgeIds.join(", ") || "none"}`,
      `Stale artifacts: ${staleArtifacts.join(", ") || "none"}`,
      plan.openQuestions.length > 0 ? `Open questions: ${plan.openQuestions.join("; ")}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  };
}
