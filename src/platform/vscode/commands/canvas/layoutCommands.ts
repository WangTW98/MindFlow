import { applyFlowOperations, type FlowOperation } from "../../../../product-flow/application/operations";
import type { ProductFlow } from "../../../../product-flow/domain";
import { editCurrentFlowDocument, showError } from "../../documents/flowDocumentService";
import type { FlowUriArgument } from "../../documents/flowUri";

export interface AutoLayoutPosition {
  x: number;
  y: number;
}

type AutoLayoutPositionRecord = Record<string, AutoLayoutPosition>;

export async function applyAutoLayoutPositions(
  projectOverviewPosition?: unknown,
  appSurfacePositions?: unknown,
  nodePositions?: unknown,
  sourceUri?: FlowUriArgument
): Promise<boolean> {
  const projectPosition = readPosition(projectOverviewPosition);
  const appSurfacePositionRecord = readPositionRecord(appSurfacePositions);
  const nodePositionRecord = readPositionRecord(nodePositions);
  if (!projectPosition || !appSurfacePositionRecord || !nodePositionRecord) {
    return false;
  }
  try {
    await editCurrentFlowDocument(sourceUri, (flow) => {
      const operations = autoLayoutPositionOperations(projectPosition, appSurfacePositionRecord, nodePositionRecord);
      const result = applyFlowOperations(flow, operations, { atomic: true });
      replaceFlow(flow, result.flow);
      return result;
    });
    return true;
  } catch (error) {
    showError("Apply auto layout failed", error);
    return false;
  }
}

function autoLayoutPositionOperations(
  projectOverviewPosition: AutoLayoutPosition,
  appSurfacePositions: AutoLayoutPositionRecord,
  nodePositions: AutoLayoutPositionRecord
): FlowOperation[] {
  return [
    { type: "project.move", x: projectOverviewPosition.x, y: projectOverviewPosition.y },
    ...Object.entries(appSurfacePositions).map(([appId, position]): FlowOperation => ({
      type: "appSurface.move",
      appId,
      x: position.x,
      y: position.y
    })),
    ...Object.entries(nodePositions).map(([nodeId, position]): FlowOperation => ({
      type: "node.move",
      nodeId,
      x: position.x,
      y: position.y
    }))
  ];
}

function readPosition(value: unknown): AutoLayoutPosition | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const x = value.x;
  const y = value.y;
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
    ? { x, y }
    : undefined;
}

function readPositionRecord(value: unknown): AutoLayoutPositionRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const positions: AutoLayoutPositionRecord = {};
  for (const [id, position] of Object.entries(value)) {
    const normalized = readPosition(position);
    if (!id || !normalized) {
      return undefined;
    }
    positions[id] = normalized;
  }
  return positions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function replaceFlow(target: ProductFlow, source: ProductFlow): void {
  for (const key of Object.keys(target)) {
    delete (target as unknown as Record<string, unknown>)[key];
  }
  Object.assign(target, source);
}
