import { strict as assert } from "node:assert";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { serializeProductFlow } from "../src/product-flow/domain/serialization/codec";
import { validateProductFlow, type PageNode } from "../src/product-flow/domain";

test("a 1000-node ProductFlow stays inside the validation and serialization baseline", () => {
  const flow = createEmptyProductFlow("Scale baseline");
  flow.nodes = Array.from({ length: 1000 }, (_, index): PageNode => ({
    nodeId: `node_${index}`,
    status: "active",
    title: `Node ${index}`,
    pageType: "page",
    appSurfaceIds: [],
    domainIds: [],
    roleIds: [],
    purpose: `Scale fixture node ${index}`,
    featureGroups: [],
    inputs: [],
    outputs: [],
    permissions: [],
    view: { position: { x: (index % 20) * 360, y: Math.floor(index / 20) * 240 } }
  }));

  const started = performance.now();
  const validation = validateProductFlow(flow);
  const text = serializeProductFlow(flow);
  const elapsedMs = performance.now() - started;

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.ok(text.length > 100_000);
  assert.ok(elapsedMs < 3000, `1000-node validation and serialization took ${elapsedMs.toFixed(1)}ms`);
});
