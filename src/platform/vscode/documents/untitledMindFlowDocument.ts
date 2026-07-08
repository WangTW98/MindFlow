import type { ProductFlow } from "../../../product-flow/domain";
import {
  createMindFlowFileName,
  createUntitledMindFlowFileName,
  MINDFLOW_FILE_EXTENSION,
  MINDFLOW_LANGUAGE_ID
} from "../../../product-flow/domain/model/fileNaming";
import { serializeProductFlow } from "../../../product-flow/domain/serialization/codec";

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
