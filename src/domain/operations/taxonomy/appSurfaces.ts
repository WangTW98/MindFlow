import type { AppSurface, ProductFlow } from "../../product-flow";
import { deleteAppSurface } from "../taxonomyEditing";
import { knownOnly, makeTaxonomyId, readOptionalString, readString, readStringArray, requireRequestId, upsertById } from "./helpers";
import type { TaxonomyRequest } from "./types";

export function applyAppSurfaceRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  flow.appSurfaces = flow.appSurfaces ?? [];
  if (request.action === "delete") {
    const appId = requireRequestId(request);
    deleteAppSurface(flow, appId);
    return;
  }
  const item = request.item ?? {};
  const requestedAppId = request.id ?? readOptionalString(item.appId);
  const existing = requestedAppId ? flow.appSurfaces.find((item) => item.appId === requestedAppId) : undefined;
  const name = readString(item.name, existing?.name ?? "新应用端");
  const appId = requestedAppId ?? makeTaxonomyId("app", name);
  const next: AppSurface = {
    appId,
    name,
    type: normalizeSurfaceType(readString(item.type, "other")),
    description: readString(item.description, ""),
    domainIds: knownOnly(readStringArray(item.domainIds), new Set(flow.domains.map((domain) => domain.domainId))),
    roleIds: knownOnly(readStringArray(item.roleIds), new Set(flow.roles.map((role) => role.roleId))),
    view: existing?.view
  };
  upsertById(flow.appSurfaces, (item) => item.appId, next);
}

function normalizeSurfaceType(value: string): AppSurface["type"] {
  return value === "admin" || value === "web" || value === "app" || value === "miniapp" || value === "desktop" || value === "other"
    ? value
    : "other";
}
