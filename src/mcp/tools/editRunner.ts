import { applyFlowOperations } from "../../domain/operations";
import type { ProductFlow } from "../../domain/product-flow";
import type { MindFlowEditorBridge, MindFlowEditorSnapshot } from "../bridge";
import { operationPayload, snapshotToPayload } from "./payloads";
import { readOptionalBoolean, readOptionalString } from "./readers";
import { readBatchItems, requiredResult } from "./toolInputReaders";
import type { BatchEditResult, BuiltMcpEdit } from "./types";
import type { McpToolResult } from "./registry";

export class McpFlowEditRunner {
  public constructor(private readonly bridge: MindFlowEditorBridge) {}

  public async editFlow(
    input: Record<string, unknown>,
    build: (flow: ProductFlow, snapshot: MindFlowEditorSnapshot) => BuiltMcpEdit
  ): Promise<McpToolResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const expectedRevision = snapshot.flow.revision;
    const built = build(snapshot.flow, snapshot);
    const applied = applyFlowOperations(snapshot.flow, built.operations, { atomic: built.atomic });
    const result = built.result
      ? built.result(applied.results, applied.flow)
      : applied.results.length === 1
        ? operationPayload(requiredResult(applied.results[0]))
        : { results: applied.results.map(operationPayload) };
    const selection = built.selection?.(applied.results) ?? applied.selection;
    const next = await this.bridge.applyFlowEdit(snapshot.uri, applied.flow, selection, expectedRevision);
    return { editor: snapshotToPayload(next), result, flow: next.flow };
  }

  public async batchEditNodes(
    input: Record<string, unknown>,
    build: (flow: ProductFlow, items: Record<string, unknown>[]) => BuiltMcpEdit
  ): Promise<BatchEditResult> {
    const snapshot = await this.bridge.getActiveEditor(readOptionalString(input, "flowUri"));
    const expectedRevision = snapshot.flow.revision;
    const dryRun = readOptionalBoolean(input, "dryRun") === true;
    const items = readBatchItems(input);
    try {
      const built = build(snapshot.flow, items);
      const applied = applyFlowOperations(snapshot.flow, built.operations, { atomic: true, dryRun });
      const result = built.result
        ? built.result(applied.results, applied.flow)
        : { results: applied.results.map(operationPayload) };
      if (dryRun) {
        return {
          editor: snapshotToPayload(snapshot),
          applied: false,
          dryRun: true,
          issues: [],
          result,
          flow: applied.flow
        };
      }
      const next = await this.bridge.applyFlowEdit(snapshot.uri, applied.flow, built.selection?.(applied.results) ?? applied.selection, expectedRevision);
      return {
        editor: snapshotToPayload(next),
        applied: true,
        dryRun: false,
        issues: [],
        result,
        flow: next.flow
      };
    } catch (error) {
      return {
        editor: snapshotToPayload(snapshot),
        applied: false,
        dryRun,
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }
}
