import { validateProductFlow, type ProductFlow } from "./productFlow";

export function assertValidProductFlowForSave(flow: ProductFlow): void {
  const validation = validateProductFlow(flow);
  if (!validation.valid) {
    throw new Error(`Refusing to save invalid ProductFlow:\n${validation.errors.join("\n")}`);
  }
}
