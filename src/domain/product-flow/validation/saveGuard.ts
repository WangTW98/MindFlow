import type { ProductFlow } from "../model/types";
import { validateProductFlow } from "..";

export function assertValidProductFlowForSave(flow: ProductFlow): void {
  const validation = validateProductFlow(flow);
  if (!validation.valid) {
    throw new Error(`Refusing to save invalid ProductFlow:\n${validation.errors.join("\n")}`);
  }
}
