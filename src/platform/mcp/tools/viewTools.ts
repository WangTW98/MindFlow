import { applyFlowOperations, type FlowOperation } from "../../../product-flow/application/operations";
import { validateProductFlow } from "../../../product-flow/domain";
import type { MindFlowEditorBridge, MindFlowRevealTarget } from "../protocol/bridge";
import { operationPayload, snapshotToPayload } from "./payloads";
import { isRecord, readOptionalBoolean, readOptionalNumber, readOptionalString, readRecords } from "./readers";
import type { McpToolActions } from "./registry";

export function createViewToolActions(
  bridge: MindFlowEditorBridge
): Pick<McpToolActions, "previewAutoLayout" | "applyAutoLayout" | "revealEntities"> {
  return {
    previewAutoLayout: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      assertRevision(snapshot.flow.revision, readOptionalNumber(input, "expectedRevision"));
      const layout = await requireAutoLayout(bridge, snapshot.uri);
      const current = await bridge.getActiveEditor(snapshot.uri);
      assertRevision(current.flow.revision, snapshot.flow.revision);
      return { editor: snapshotToPayload(current), layout };
    },
    applyAutoLayout: async (input) => {
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      const expectedRevision = requireRevision(input.expectedRevision);
      assertRevision(snapshot.flow.revision, expectedRevision);
      const layout = await requireAutoLayout(bridge, snapshot.uri);
      const operations = layoutOperations(layout);
      const dryRun = readOptionalBoolean(input, "dryRun") === true;
      const applied = applyFlowOperations(snapshot.flow, operations, { atomic: true, dryRun });
      const validation = validateProductFlow(applied.flow);
      if (!validation.valid) {
        return { editor: snapshotToPayload(snapshot), applied: false, dryRun, validation };
      }
      if (dryRun) {
        return {
          editor: snapshotToPayload(snapshot), applied: false, dryRun: true, validation,
          operations: applied.results.map(operationPayload), layout,
          change: { operationCount: applied.results.length, revision: snapshot.flow.revision }
        };
      }
      const next = await bridge.applyFlowEdit(snapshot.uri, applied.flow, applied.selection, expectedRevision);
      return {
        editor: snapshotToPayload(next), applied: true, dryRun: false, validation,
        operations: applied.results.map(operationPayload), layout,
        change: { operationCount: applied.results.length, revision: next.flow.revision }
      };
    },
    revealEntities: async (input) => {
      if (!bridge.revealEntities) throw new Error("This MindFlow bridge cannot reveal canvas entities.");
      const snapshot = await bridge.getActiveEditor(readOptionalString(input, "flowUri"));
      assertRevision(snapshot.flow.revision, readOptionalNumber(input, "expectedRevision"));
      const targets = readRevealTargets(input.targets, snapshot.flow);
      await bridge.revealEntities(snapshot.uri, targets, readOptionalBoolean(input, "animate") !== false);
      return { editor: snapshotToPayload(snapshot), revealed: targets, changedDocument: false };
    }
  };
}

async function requireAutoLayout(bridge: MindFlowEditorBridge, flowUri: string) {
  if (!bridge.previewAutoLayout) throw new Error("This MindFlow bridge cannot compute canvas auto layout.");
  return bridge.previewAutoLayout(flowUri);
}

function layoutOperations(layout: Awaited<ReturnType<NonNullable<MindFlowEditorBridge["previewAutoLayout"]>>>): FlowOperation[] {
  return [
    { type: "project.move", ...layout.projectOverviewPosition },
    ...Object.entries(layout.appSurfacePositions).map(([appId, position]): FlowOperation => ({ type: "appSurface.move", appId, ...position })),
    ...Object.entries(layout.nodePositions).map(([nodeId, position]): FlowOperation => ({ type: "node.move", nodeId, ...position }))
  ];
}

function readRevealTargets(value: unknown, flow: Awaited<ReturnType<MindFlowEditorBridge["getActiveEditor"]>>["flow"]): MindFlowRevealTarget[] {
  const targets = readRecords(value).map((target) => {
    const kind = readOptionalString(target, "kind");
    const id = readOptionalString(target, "id");
    if (!id || (kind !== "projectOverview" && kind !== "appSurface" && kind !== "node")) return undefined;
    return { kind, id };
  }).filter((target): target is MindFlowRevealTarget => Boolean(target));
  if (targets.length === 0) throw new Error("Reveal entities requires at least one valid target.");
  for (const target of targets) {
    const exists = target.kind === "projectOverview"
      ? target.id === "projectOverview"
      : target.kind === "appSurface"
        ? flow.appSurfaces.some((surface) => surface.appId === target.id)
        : flow.nodes.some((node) => node.nodeId === target.id && node.status !== "removed");
    if (!exists) throw new Error(`Cannot reveal unknown active ${target.kind}: ${target.id}.`);
  }
  return targets;
}

function requireRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error("expectedRevision must be a positive integer.");
  return value;
}

function assertRevision(actual: number, expected: number | undefined): void {
  if (expected !== undefined && actual !== expected) throw new Error(`ProductFlow revision conflict. Expected ${expected}, found ${actual}.`);
}
