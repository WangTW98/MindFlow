import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { validateProductFlow, type ProductFlow } from "../src/product-flow/domain";

test("editor JSON Schema and runtime validator agree on structural ProductFlow fixtures", async () => {
  const validateSchema = await loadSchemaValidator();
  const fixtures: Array<{ name: string; flow: unknown; valid: boolean }> = [
    { name: "current empty flow", flow: createEmptyProductFlow(), valid: true },
    { name: "empty required title", flow: patchFlow((flow) => { flow.title = ""; }), valid: false },
    { name: "invalid timestamp", flow: patchFlow((flow) => { flow.updatedAt = "yesterday"; }), valid: false },
    { name: "obsolete node field", flow: patchFlow((flow) => {
      flow.nodes.push({
        nodeId: "node_test", status: "active", title: "Test", pageType: "page", appSurfaceIds: [],
        domainIds: [], roleIds: [], purpose: "Test", featureGroups: [], inputs: [], outputs: [], permissions: [],
        ...({ elements: [] } as Record<string, unknown>)
      });
    }), valid: false },
    { name: "duplicate string references", flow: patchFlow((flow) => {
      flow.domains.push({ domainId: "domain_a", name: "A", description: "" });
      flow.roles.push({ roleId: "role_a", name: "A", description: "", domainIds: ["domain_a", "domain_a"] });
    }), valid: false }
  ];

  for (const fixture of fixtures) {
    const schemaValid = validateSchema(fixture.flow) === true;
    const runtimeValid = validateProductFlow(fixture.flow).valid;
    assert.equal(schemaValid, fixture.valid, `${fixture.name} schema result: ${JSON.stringify(validateSchema.errors)}`);
    assert.equal(runtimeValid, fixture.valid, `${fixture.name} runtime result`);
  }
});

async function loadSchemaValidator(): Promise<ValidateFunction> {
  const raw = await fs.readFile(path.join(process.cwd(), "assets", "product-flow", "schema", "productFlow.schema.json"), "utf8");
  return new Ajv2020({ allErrors: true, strict: true }).compile(JSON.parse(raw));
}

function patchFlow(edit: (flow: ProductFlow) => void): ProductFlow {
  const flow = createEmptyProductFlow();
  edit(flow);
  return flow;
}
