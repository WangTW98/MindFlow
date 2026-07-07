import type { BusinessDomain, ProductFlow } from "../..";
import { makeTaxonomyId, readOptionalString, readString, requireRequestId, upsertById } from "./helpers";
import type { TaxonomyRequest } from "./types";

export function applyDomainRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  if (request.action === "delete") {
    const domainId = requireRequestId(request);
    flow.domains = flow.domains.filter((item) => item.domainId !== domainId);
    for (const role of flow.roles) {
      role.domainIds = role.domainIds.filter((id) => id !== domainId);
    }
    for (const app of flow.appSurfaces ?? []) {
      app.domainIds = app.domainIds.filter((id) => id !== domainId);
    }
    for (const node of flow.nodes) {
      node.domainIds = node.domainIds.filter((id) => id !== domainId);
    }
    for (const edge of flow.edges) {
      edge.domainIds = edge.domainIds.filter((id) => id !== domainId);
    }
    return;
  }
  const item = request.item ?? {};
  const requestedDomainId = request.id ?? readOptionalString(item.domainId);
  const existing = requestedDomainId ? flow.domains.find((item) => item.domainId === requestedDomainId) : undefined;
  const name = readString(item.name, existing?.name ?? "新业务域");
  const domainId = requestedDomainId ?? makeTaxonomyId("domain", name);
  const next: BusinessDomain = {
    domainId,
    name,
    description: readString(item.description, "")
  };
  upsertById(flow.domains, (item) => item.domainId, next);
}
