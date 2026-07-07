import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import test from "node:test";
import { createEmptyProductFlow } from "../src/domain/product-flow/factory";
import { createManualNode } from "../src/domain/operations/flowEditing";
import { hasOptionalFiniteCoordinates, isPlainObject, readFiniteCoordinates } from "../src/vscode/commands/guards";
import { assertValidProductFlowForSave } from "../src/domain/product-flow/saveGuard";
import { assertThrows } from "./helpers";

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

test("Flow document save guard rejects invalid ProductFlow before writing", () => {
  const flow = createEmptyProductFlow();
  createManualNode(flow, { title: "非法引用页", domainIds: ["missing_domain"] });

  assertThrows(
    () => assertValidProductFlowForSave(flow),
    /Refusing to save invalid ProductFlow/
  );
});

test("New blank MindFlow always opens a plain untitled document", async () => {
  const source = await fs.readFile(path.join(process.cwd(), "src", "vscode", "commands", "fileCommands.ts"), "utf8");

  assert.equal(source.includes("createUntitledMindFlowUri"), false);
  assert.equal(source.includes("openTextDocument(untitledUri)"), false);
  assert.equal(source.includes("openTextDocument(options)"), true);
});
