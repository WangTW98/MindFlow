import * as path from "node:path";
import { MINDFLOW_FILE_EXTENSION } from "../core/untitledMindFlowDocument";
import type { ProductFlow } from "../models/productFlow";
import { tryParseProductFlowText } from "../models/productFlowCodec";

interface MindFlowDocumentLike {
  isUntitled: boolean;
  uri: {
    fsPath: string;
    toString(): string;
  };
}

export function isAssociatedMindFlowUntitled(document: MindFlowDocumentLike): boolean {
  if (!document.isUntitled) {
    return false;
  }
  const uriText = document.uri.toString().toLowerCase();
  const fsPath = document.uri.fsPath.toLowerCase();
  return uriText.endsWith(MINDFLOW_FILE_EXTENSION) || path.extname(fsPath) === MINDFLOW_FILE_EXTENSION;
}

export function parseValidFlow(text: string): ProductFlow | undefined {
  return tryParseProductFlowText(text);
}

export function chooseFresherFlow(documentFlow: ProductFlow, fallbackFlow: ProductFlow): ProductFlow {
  if (fallbackFlow.revision > documentFlow.revision) {
    return fallbackFlow;
  }
  if (fallbackFlow.revision < documentFlow.revision) {
    return documentFlow;
  }
  return flowUpdatedAtMs(fallbackFlow) > flowUpdatedAtMs(documentFlow) ? fallbackFlow : documentFlow;
}

function flowUpdatedAtMs(flow: ProductFlow): number {
  const value = Date.parse(flow.updatedAt);
  return Number.isFinite(value) ? value : 0;
}
