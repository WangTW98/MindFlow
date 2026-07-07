import type { ProductFlow } from "../../../../domain/product-flow";

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
