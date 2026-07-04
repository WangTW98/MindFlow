import type { FlowEdge, PageAction, PageElement, PageNode } from "./productFlow";

export type FlowOperationType =
  | "addNode"
  | "updateNode"
  | "removeNode"
  | "addEdge"
  | "updateEdge"
  | "removeEdge"
  | "addElement"
  | "updateElement"
  | "removeElement"
  | "addAction"
  | "updateAction"
  | "removeAction"
  | "rewireEdge"
  | "splitNode"
  | "mergeNodes"
  | "markArtifactStale";

export interface FlowOperationTarget {
  nodeId?: string;
  edgeId?: string;
  elementId?: string;
  actionId?: string;
  artifactId?: string;
  nodeIds?: string[];
}

export type FlowOperationBeforeAfter =
  | Partial<PageNode>
  | Partial<FlowEdge>
  | Partial<PageElement>
  | Partial<PageAction>
  | Record<string, unknown>
  | null;

export interface FlowOperation {
  opId: string;
  type: FlowOperationType;
  target: FlowOperationTarget;
  before: FlowOperationBeforeAfter;
  after: FlowOperationBeforeAfter;
  reason: string;
  risk: "low" | "medium" | "high";
  requiresConfirmation: boolean;
}

export interface ArtifactImpact {
  artifactId: string;
  artifactType: "prd" | "pencil";
  status: "stale" | "unchanged" | "needsRegeneration";
  reason: string;
}

export interface FlowChangePlan {
  changeSetId: string;
  flowId: string;
  baseRevision: number;
  instruction: string;
  intent: string;
  requiresClarification: boolean;
  operations: FlowOperation[];
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  artifactImpact: ArtifactImpact[];
  openQuestions: string[];
  confidence: number;
}

export interface FlowChangeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateFlowChangePlan(plan: unknown): FlowChangeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(plan)) {
    return { valid: false, errors: ["FlowChangePlan must be an object."], warnings };
  }

  requireString(plan, "changeSetId", errors);
  requireString(plan, "flowId", errors);
  requireNumber(plan, "baseRevision", errors);
  requireString(plan, "instruction", errors);
  requireString(plan, "intent", errors);
  requireBoolean(plan, "requiresClarification", errors);
  requireArray(plan, "operations", errors);
  requireArray(plan, "affectedNodeIds", errors);
  requireArray(plan, "affectedEdgeIds", errors);
  requireArray(plan, "artifactImpact", errors);
  requireArray(plan, "openQuestions", errors);
  requireNumber(plan, "confidence", errors);

  if (Array.isArray(plan.operations)) {
    for (const [index, op] of plan.operations.entries()) {
      if (!isRecord(op)) {
        errors.push(`operations[${index}] must be an object.`);
        continue;
      }
      requireString(op, "opId", errors, `operations[${index}]`);
      requireString(op, "type", errors, `operations[${index}]`);
      requireObject(op, "target", errors, `operations[${index}]`);
      requireString(op, "reason", errors, `operations[${index}]`);
      requireString(op, "risk", errors, `operations[${index}]`);
      requireBoolean(op, "requiresConfirmation", errors, `operations[${index}]`);
      if (op.type === "removeNode" || op.type === "removeEdge" || op.type === "removeElement") {
        if (op.requiresConfirmation !== true) {
          errors.push(`operations[${index}] destructive operation must require confirmation.`);
        }
      }
    }
  }

  if (plan.requiresClarification === true && Array.isArray(plan.openQuestions) && plan.openQuestions.length === 0) {
    warnings.push("Plan requires clarification but has no open questions.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function isFlowChangePlan(plan: unknown): plan is FlowChangePlan {
  return validateFlowChangePlan(plan).valid;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "string") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a string.`);
  }
}

function requireNumber(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be a number.`);
  }
}

function requireBoolean(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (typeof obj[key] !== "boolean") {
    errors.push(`${path ? `${path}.` : ""}${key} must be a boolean.`);
  }
}

function requireArray(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!Array.isArray(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an array.`);
  }
}

function requireObject(obj: Record<string, unknown>, key: string, errors: string[], path?: string): void {
  if (!isRecord(obj[key])) {
    errors.push(`${path ? `${path}.` : ""}${key} must be an object.`);
  }
}
