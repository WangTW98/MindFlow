import * as path from "node:path";
import type { ProductFlow } from "../models/productFlow";
import { serializeProductFlow } from "../models/productFlowCodec";
import { slugify } from "../utils/id";

export const MINDFLOW_LANGUAGE_ID = "mindflow";
export const MINDFLOW_FILE_EXTENSION = ".mindflow";

export interface UntitledMindFlowDocumentOptions {
  content: string;
  language: typeof MINDFLOW_LANGUAGE_ID;
}

export function createUntitledMindFlowDocumentOptions(flow: ProductFlow): UntitledMindFlowDocumentOptions {
  return {
    content: serializeProductFlow(flow),
    language: MINDFLOW_LANGUAGE_ID
  };
}

export function createUntitledMindFlowFileName(flow: ProductFlow): string {
  return `Untitled-MindFlow-${flow.flowId}${MINDFLOW_FILE_EXTENSION}`;
}

export function createMindFlowFileName(flow: ProductFlow): string {
  if (flow.title === "Untitled MindFlow") {
    return createUntitledMindFlowFileName(flow);
  }
  return `${slugify(flow.title, "flow")}-${flow.flowId}${MINDFLOW_FILE_EXTENSION}`;
}

export function createUntitledMindFlowTargetPath(
  flow: ProductFlow,
  workspaceRoot: string | undefined,
  flowDirectory: string
): string | undefined {
  return workspaceRoot ? path.join(workspaceRoot, flowDirectory, createMindFlowFileName(flow)) : undefined;
}
