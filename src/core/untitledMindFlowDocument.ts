import type { ProductFlow } from "../models/productFlow";

export const MINDFLOW_LANGUAGE_ID = "mindflow";

export interface UntitledMindFlowDocumentOptions {
  content: string;
  language: typeof MINDFLOW_LANGUAGE_ID;
}

export function createUntitledMindFlowDocumentOptions(flow: ProductFlow): UntitledMindFlowDocumentOptions {
  return {
    content: `${JSON.stringify(flow, null, 2)}\n`,
    language: MINDFLOW_LANGUAGE_ID
  };
}
