import type { TaxonomyKind } from "../../../application/flow-operations";
import { requireStringEither } from "./readers";
import { readRequiredPosition, taxonomyUpsertOperation } from "./toolInputReaders";
import type { McpToolActions } from "./registry";
import type { McpFlowEditRunner } from "./editRunner";

export function createTaxonomyToolActions(
  runner: McpFlowEditRunner
): Pick<McpToolActions, "upsertAppSurface" | "removeAppSurface" | "moveAppSurface" | "upsertDomain" | "removeDomain" | "upsertRole" | "removeRole" | "upsertStatusGroup" | "removeStatusGroup"> {
  const upsertTaxonomy = (input: Record<string, unknown>, kind: TaxonomyKind) => runner.editFlow(input, () => ({
    operations: [taxonomyUpsertOperation(input, kind)]
  }));
  const removeTaxonomy = (input: Record<string, unknown>, kind: TaxonomyKind, idKeys: string[]) => runner.editFlow(input, () => ({
    operations: [{ type: "taxonomy.remove", kind, id: requireStringEither(input, idKeys) }]
  }));
  return {
    upsertAppSurface: (input) => upsertTaxonomy(input, "appSurface"),
    removeAppSurface: (input) => removeTaxonomy(input, "appSurface", ["appId", "id"]),
    moveAppSurface: (input) => runner.editFlow(input, () => {
      const position = readRequiredPosition(input);
      return {
        operations: [{ type: "appSurface.move", appId: requireStringEither(input, ["appId", "id"]), x: position.x, y: position.y }]
      };
    }),
    upsertDomain: (input) => upsertTaxonomy(input, "domain"),
    removeDomain: (input) => removeTaxonomy(input, "domain", ["domainId", "id"]),
    upsertRole: (input) => upsertTaxonomy(input, "role"),
    removeRole: (input) => removeTaxonomy(input, "role", ["roleId", "id"]),
    upsertStatusGroup: (input) => upsertTaxonomy(input, "statusGroup"),
    removeStatusGroup: (input) => removeTaxonomy(input, "statusGroup", ["statusGroupId", "id"])
  };
}
