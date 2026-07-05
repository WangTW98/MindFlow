import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/core/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/core/canvasLayout";
import { createEmptyProductFlow } from "../src/core/emptyFlow";
import { createManualEdge, createManualNode, removeManualEdge, removeManualNode, updateManualAppSurfacePosition, updateManualEdgeDetails, updateManualNodeDetails, updateManualNodePosition } from "../src/core/flowEditing";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview } from "../src/core/projectOverview";
import { applyTaxonomyRequest } from "../src/core/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/core/taxonomyEditing";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/core/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/models/productFlow";
import { parseProductFlowText, serializeProductFlow } from "../src/models/productFlowCodec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/storage/flowRepository";
import { RecentFlowStore } from "../src/storage/recentFlows";
import { recordEdgeDetailsRevision } from "../src/webview/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, renderFlowWebviewHtml } from "../src/webview/flowWebviewHtml";
import { parseWebviewMessage } from "../src/webview/flowWebviewMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

test("FlowRepository saves and lists only .mindflow ProductFlow files", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mindflow-repo-"));
  try {
    const flow = createProcurementFlow();
    const repository = new FlowRepository(workspaceRoot);
    const savedPath = await repository.save(flow);
    assert.equal(path.extname(savedPath), FLOW_FILE_EXTENSION);
    assertNoLegacyKeysInJson(await fs.readFile(savedPath, "utf8"));

    const legacyPath = path.join(repository.directoryPath, "legacy-flow.json");
    await fs.writeFile(legacyPath, `${JSON.stringify(flow, null, 2)}\n`, "utf8");
    const listed = await repository.list();

    assert.ok(listed.includes(savedPath));
    assert.equal(listed.includes(legacyPath), false);

    const sharedPath = path.join(repository.directoryPath, `shared${FLOW_FILE_EXTENSION}`);
    await Promise.all([
      repository.saveToPath(sharedPath, createEmptyProductFlow("并发保存 A")),
      repository.saveToPath(sharedPath, createEmptyProductFlow("并发保存 B"))
    ]);
    const loaded = await repository.load(sharedPath);
    const entries = await fs.readdir(repository.directoryPath);
    assert.equal(validateProductFlow(loaded).valid, true);
    assert.equal(entries.some((entry) => entry.endsWith(".tmp")), false);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("RecentFlowStore clears and removes recent MindFlow records", async () => {
  const state = new FakeMemento();
  const store = new RecentFlowStore(state as unknown as vscode.Memento);
  const first = path.join(os.tmpdir(), "first.mindflow");
  const second = path.join(os.tmpdir(), "second.mindflow");

  await store.add(first, 100);
  await store.add(second, 200);
  await store.add(first, 300);

  assert.deepEqual(store.get()?.map((record) => record.absolutePath), [path.normalize(first), path.normalize(second)]);

  await store.remove(first);
  assert.deepEqual(store.get()?.map((record) => record.absolutePath), [path.normalize(second)]);

  await store.clear();
  assert.deepEqual(store.get(), []);
});
