import type { ProductFlow, ValidationResult } from "../model/types";
import { validateProductFlow } from "../validation";

export interface ProductFlowParseResult {
  flow: ProductFlow;
  validation: ValidationResult;
}

export function parseProductFlowText(text: string, label = "ProductFlow"): ProductFlowParseResult {
  const parsed = JSON.parse(text) as unknown;
  const validation = validateProductFlow(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid ${label}:\n${validation.errors.join("\n")}`);
  }
  return { flow: parsed as ProductFlow, validation };
}

export function tryParseProductFlowText(text: string): ProductFlow | undefined {
  try {
    return parseProductFlowText(text).flow;
  } catch {
    return undefined;
  }
}

export function serializeProductFlow(flow: ProductFlow): string {
  const validation = validateProductFlow(flow);
  if (!validation.valid) {
    throw new Error(`Cannot serialize invalid ProductFlow:\n${validation.errors.join("\n")}`);
  }
  return `${JSON.stringify(flow, null, 2)}\n`;
}
