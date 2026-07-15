import type { AppSurface, ProductFlow } from "../..";
import { deleteAppSurface } from "./referenceCleanup";
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
    type: item.type === undefined
      ? existing?.type ?? "other"
      : normalizeSurfaceType(readString(item.type, existing?.type ?? "other")),
    description: item.description === undefined
      ? existing?.description ?? ""
      : readString(item.description, existing?.description ?? ""),
    domainIds: item.domainIds === undefined
      ? [...(existing?.domainIds ?? [])]
      : knownOnly(readStringArray(item.domainIds), new Set(flow.domains.map((domain) => domain.domainId))),
    roleIds: item.roleIds === undefined
      ? [...(existing?.roleIds ?? [])]
      : knownOnly(readStringArray(item.roleIds), new Set(flow.roles.map((role) => role.roleId))),
    view: existing?.view
  };
  upsertById(flow.appSurfaces, (item) => item.appId, next);
}

function normalizeSurfaceType(value: string): AppSurface["type"] {
  return value === "admin" || value === "web" || value === "app" || value === "miniapp" || value === "desktop" || value === "other"
    ? value
    : "other";
}
