import type { ProductFlow } from "../models/productFlow";
import { nowIso } from "../utils/id";
import { applyAppSurfaceRequest } from "./taxonomy/appSurfaces";
import { applyDomainRequest } from "./taxonomy/domains";
import { applyRoleRequest } from "./taxonomy/roles";
import { applyStatusGroupRequest } from "./taxonomy/statusGroups";
import type { TaxonomyRequest } from "./taxonomy/types";

export type { TaxonomyAction, TaxonomyKind, TaxonomyRequest } from "./taxonomy/types";

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
  flow.revision += 1;
  flow.updatedAt = nowIso();
}
