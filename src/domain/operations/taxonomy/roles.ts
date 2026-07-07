import type { ProductFlow, UserRole } from "../../product-flow";
import { knownOnly, makeTaxonomyId, readOptionalString, readString, readStringArray, requireRequestId, upsertById } from "./helpers";
import type { TaxonomyRequest } from "./types";

export function applyRoleRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  if (request.action === "delete") {
    const roleId = requireRequestId(request);
    flow.roles = flow.roles.filter((item) => item.roleId !== roleId);
    for (const app of flow.appSurfaces ?? []) {
      app.roleIds = app.roleIds.filter((id) => id !== roleId);
    }
    for (const node of flow.nodes) {
      node.roleIds = node.roleIds.filter((id) => id !== roleId);
      node.permissions = node.permissions.filter((id) => id !== roleId);
    }
    for (const edge of flow.edges) {
      edge.roleIds = edge.roleIds.filter((id) => id !== roleId);
    }
    return;
  }
  const item = request.item ?? {};
  const requestedRoleId = request.id ?? readOptionalString(item.roleId);
  const existing = requestedRoleId ? flow.roles.find((item) => item.roleId === requestedRoleId) : undefined;
  const name = readString(item.name, existing?.name ?? "新角色");
  const roleId = requestedRoleId ?? makeTaxonomyId("role", name);
  const next: UserRole = {
    roleId,
    name,
    description: readString(item.description, ""),
    domainIds: knownOnly(readStringArray(item.domainIds), new Set(flow.domains.map((domain) => domain.domainId)))
  };
  upsertById(flow.roles, (item) => item.roleId, next);
}
