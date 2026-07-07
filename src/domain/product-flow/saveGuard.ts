import type { ProductFlow } from "./types";
import { validateProductFlow } from "./validation";

export function assertValidProductFlowForSave(flow: ProductFlow): void {
  const validation = validateProductFlow(flow);
  if (!validation.valid) {
    throw new Error(`Refusing to save invalid ProductFlow:\n${validation.errors.join("\n")}`);
  }
}
