import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/domain/operations/layout/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/domain/operations/layout/canvasLayout";
import { createEmptyProductFlow } from "../src/domain/product-flow/factory";
import { createManualEdge, createManualNode, removeManualEdge, removeManualNode, updateManualAppSurfacePosition, updateManualEdgeDetails, updateManualNodeDetails, updateManualNodePosition } from "../src/domain/operations/flowEditing";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview } from "../src/domain/operations/projectOverview";
import { applyTaxonomyRequest } from "../src/domain/operations/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/domain/operations/taxonomyEditing";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/extension/documents/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/domain/product-flow";
import { parseProductFlowText, serializeProductFlow } from "../src/domain/product-flow/codec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/storage/flowRepository";
import { RecentFlowStore } from "../src/extension/state/recentFlows";
import { recordEdgeDetailsRevision } from "../src/extension/webviews/canvas/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, renderFlowWebviewHtml } from "../src/extension/webviews/canvas/flowWebviewHtml";
import { parseWebviewMessage } from "../src/webview/flowWebviewMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

test("Extension manifest contributes standalone .mindflow editor, sidebar, and MCP config command", async () => {
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
    "mindflow.validateFlowJson",
    "mindflow.copyMcpConfig"
  ]);
  assert.equal(
    manifest.contributes?.keybindings?.some((item) => item.command === "mindflow.saveFlowAs" && item.mac === "cmd+s") ?? false,
    false
  );
  assert.deepEqual(Object.keys(manifest.contributes?.configuration?.properties ?? {}), ["mindflow.storage.flowDirectory"]);
  assert.deepEqual(manifest.bin, { "mindflow-mcp": "./out/src/mcp/stdioBridge.js" });
  const removedScriptPrefix = ["m", "c", "p"].join("") + ":";
  assert.equal(Object.keys(manifest.scripts ?? {}).some((script) => script.startsWith(removedScriptPrefix)), false);
  assert.equal(manifest.activationEvents?.includes("onStartupFinished"), true);
  assert.equal(manifest.activationEvents?.includes("onCommand:mindflow.copyMcpConfig"), true);
});
