import type { ProductFlow } from "../..";
import { nowIso } from "../../id";
import { refreshAllFlowEdgeDerivedState } from "../graph/edges";
import { applyAppSurfaceRequest } from "./appSurfaces";
import { applyDomainRequest } from "./domains";
import { applyRoleRequest } from "./roles";
import { applyStatusGroupRequest } from "./statusGroups";
import type { TaxonomyRequest } from "./types";

export type { TaxonomyAction, TaxonomyKind, TaxonomyRequest } from "./types";

export function applyTaxonomyRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  switch (request.kind) {
    case "appSurface":
      applyAppSurfaceRequest(flow, request);
      break;
    case "domain":
      applyDomainRequest(flow, request);
      break;
    case "role":
      applyRoleRequest(flow, request);
      break;
    case "statusGroup":
      applyStatusGroupRequest(flow, request);
      break;
    default:
      throw new Error(`Unsupported taxonomy kind: ${String(request.kind)}`);
  }
  refreshAllFlowEdgeDerivedState(flow);
  flow.revision += 1;
  flow.updatedAt = nowIso();
}
