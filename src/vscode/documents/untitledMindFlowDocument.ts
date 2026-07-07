import type { ProductFlow } from "../../domain/product-flow";
import {
  createMindFlowFileName,
  createUntitledMindFlowFileName,
  MINDFLOW_FILE_EXTENSION,
  MINDFLOW_LANGUAGE_ID
} from "../../domain/product-flow/fileNaming";
import { serializeProductFlow } from "../../domain/product-flow/codec";

export {
  createMindFlowFileName,
  createUntitledMindFlowFileName,
  MINDFLOW_FILE_EXTENSION,
  MINDFLOW_LANGUAGE_ID
};

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
