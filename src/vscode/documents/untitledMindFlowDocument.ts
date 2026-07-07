import type { ProductFlow } from "../../state/product-flow";
import {
  createMindFlowFileName,
  createUntitledMindFlowFileName,
  createUntitledMindFlowTargetPath,
  MINDFLOW_FILE_EXTENSION,
  MINDFLOW_LANGUAGE_ID
} from "../../state/product-flow/fileNaming";
import { serializeProductFlow } from "../../state/product-flow/codec";

export {
  createMindFlowFileName,
  createUntitledMindFlowFileName,
  createUntitledMindFlowTargetPath,
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
