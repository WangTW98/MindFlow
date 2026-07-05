import type { ProductFlow } from "../models/productFlow";
import { serializeProductFlow } from "../models/productFlowCodec";

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
