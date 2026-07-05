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

test("Extension manifest contributes standalone .mindflow editor and sidebar only", async () => {
  const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf8");
  const manifest = JSON.parse(raw) as {
    activationEvents?: string[];
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
    contributes?: {
      viewsContainers?: { activitybar?: Array<{ id?: string; icon?: string }> };
      views?: Record<string, Array<{ id?: string; type?: string }>>;
      languages?: Array<{ id?: string; extensions?: string[]; icon?: { light?: string; dark?: string } }>;
      customEditors?: Array<{ viewType?: string; selector?: Array<{ filenamePattern?: string }> }>;
      commands?: Array<{ command?: string }>;
      keybindings?: Array<{ command?: string; key?: string; mac?: string; when?: string }>;
      configuration?: { properties?: Record<string, { default?: string; enum?: string[] }> };
    };
  };

  assert.ok(manifest.contributes?.viewsContainers?.activitybar?.some((item) => item.id === "mindflow" && item.icon === "src/webview/media/icon.svg"));
  const sidebarView = manifest.contributes?.views?.mindflow?.find((item) => item.id === "mindflow.sidebar");
  assert.equal(sidebarView?.type, "webview");
  const language = manifest.contributes?.languages?.find((item) => item.id === "mindflow");
  assert.ok(language?.extensions?.includes(".mindflow"));
  assert.equal(language?.icon?.light, "src/webview/media/icon.svg");
  assert.equal(language?.icon?.dark, "src/webview/media/icon.svg");
  const editor = manifest.contributes?.customEditors?.find((item) => item.viewType === "mindflow.productFlow");
  assert.ok(editor);
  assert.ok(editor.selector?.some((item) => item.filenamePattern === "*.mindflow"));
  assert.equal(editor.selector?.some((item) => String(item.filenamePattern || "").endsWith(".json")), false);

  assert.deepEqual(manifest.contributes?.commands?.map((item) => item.command), [
    "mindflow.newFlow",
    "mindflow.openFlow",
    "mindflow.saveFlowAs",
    "mindflow.validateFlowJson"
  ]);
  assert.equal(
    manifest.contributes?.keybindings?.some((item) => item.command === "mindflow.saveFlowAs" && item.mac === "cmd+s") ?? false,
    false
  );
  assert.deepEqual(Object.keys(manifest.contributes?.configuration?.properties ?? {}), ["mindflow.storage.flowDirectory"]);
  assert.equal(manifest.bin, undefined);
  const removedScriptPrefix = ["m", "c", "p"].join("") + ":";
  const blockedActivationWords = [["m", "c", "p"], ["a", "g", "e", "n", "t"], ["a", "i"]].map((parts) => parts.join(""));
  assert.equal(Object.keys(manifest.scripts ?? {}).some((script) => script.startsWith(removedScriptPrefix)), false);
  assert.equal(manifest.activationEvents?.some((event) => blockedActivationWords.some((word) => event.toLowerCase().includes(word))), false);
});
