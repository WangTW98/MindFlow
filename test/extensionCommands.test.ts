import { strict as assert } from "node:assert";
import test from "node:test";
import { hasOptionalFiniteCoordinates, isPlainObject, readFiniteCoordinates } from "../src/extension/commands/guards";

test("Command guards reject non-finite coordinates and non-object patches", () => {
  assert.deepEqual(readFiniteCoordinates(12.5, -4), { x: 12.5, y: -4 });
  assert.equal(readFiniteCoordinates(Number.NaN, 0), undefined);
  assert.equal(readFiniteCoordinates(0, Number.POSITIVE_INFINITY), undefined);

  assert.equal(hasOptionalFiniteCoordinates(undefined, undefined), true);
  assert.equal(hasOptionalFiniteCoordinates(100, undefined), true);
  assert.equal(hasOptionalFiniteCoordinates(undefined, Number.NEGATIVE_INFINITY), false);

  assert.equal(isPlainObject<Record<string, unknown>>({ title: "采购工作台" }), true);
  assert.equal(isPlainObject<Record<string, unknown>>([]), false);
  assert.equal(isPlainObject<Record<string, unknown>>(null), false);
});
