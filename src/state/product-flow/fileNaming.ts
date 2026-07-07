import * as path from "node:path";
import { slugify } from "../id";
import type { ProductFlow } from "./types";

export const MINDFLOW_LANGUAGE_ID = "mindflow";
export const MINDFLOW_FILE_EXTENSION = ".mindflow";

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
