export type TaxonomyKind = "appSurface" | "domain" | "role" | "statusGroup";
export type TaxonomyAction = "create" | "update" | "delete";

export interface TaxonomyRequest {
  kind: TaxonomyKind;
  action: TaxonomyAction;
  id?: string;
  item?: Record<string, unknown>;
}
