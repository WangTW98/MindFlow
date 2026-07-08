import { strict as assert } from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import type * as vscode from "vscode";
import { ensureAppSurfaceEntryEdges } from "../src/product-flow/domain/editing/layout/appSurfaceEntryEdges";
import { ensureReasonableNodeLayout } from "../src/product-flow/domain/editing/layout/canvasLayout";
import { createEmptyProductFlow } from "../src/product-flow/domain/model/factory";
import { createFlowEdge, createFlowNode, removeFlowEdge, removeFlowNode, updateFlowAppSurfacePosition, updateFlowEdgeDetails, updateFlowNodeDetails, updateFlowNodePosition } from "../src/product-flow/domain/editing/graph";
import { PROJECT_OVERVIEW_NODE_ID, ensureProjectOverview, updateProjectOverview } from "../src/product-flow/domain/editing/projectOverviewMutations";
import { applyTaxonomyRequest } from "../src/product-flow/domain/editing/taxonomy";
import { deleteAppSurface, pruneMissingAppSurfaceReferences } from "../src/product-flow/domain/editing/taxonomy/referenceCleanup";
import { MINDFLOW_FILE_EXTENSION, MINDFLOW_LANGUAGE_ID, createUntitledMindFlowDocumentOptions, createUntitledMindFlowFileName } from "../src/platform/vscode/documents/untitledMindFlowDocument";
import { EDGE_TYPES, validateProductFlow } from "../src/product-flow/domain";
import { parseProductFlowText, serializeProductFlow } from "../src/product-flow/domain/serialization/codec";
import { FLOW_FILE_EXTENSION, FlowRepository } from "../src/product-flow/infrastructure/persistence/flowRepository";
import { RecentFlowStore } from "../src/platform/vscode/state/recentFlows";
import { recordEdgeDetailsRevision } from "../src/platform/vscode/editor/canvas/flowMessageOrdering";
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, createFlowWebviewHtml } from "../src/platform/vscode/editor/canvas/webviewShellHtml";
import { parseWebviewMessage } from "../src/platform/webview/protocol/flowWebviewMessages";
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
      jsonValidation?: Array<{ fileMatch?: string[]; url?: string }>;
    };
  };

  assert.ok(manifest.contributes?.viewsContainers?.activitybar?.some((item) => item.id === "mindflow" && item.icon === "assets/webview/media/icon.svg"));
  const sidebarView = manifest.contributes?.views?.mindflow?.find((item) => item.id === "mindflow.sidebar");
  assert.equal(sidebarView?.type, "webview");
  const language = manifest.contributes?.languages?.find((item) => item.id === "mindflow");
  assert.ok(language?.extensions?.includes(".mindflow"));
  assert.equal(language?.icon?.light, "assets/webview/media/icon.svg");
  assert.equal(language?.icon?.dark, "assets/webview/media/icon.svg");
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
  assert.equal(manifest.contributes?.jsonValidation?.[0]?.url, "./assets/product-flow/schema/productFlow.schema.json");
  assert.deepEqual(manifest.bin, { "mindflow-mcp": "./out/platform/mcp/protocol/stdioProxy.js" });
  const removedScriptPrefix = ["m", "c", "p"].join("") + ":";
  assert.equal(Object.keys(manifest.scripts ?? {}).some((script) => script.startsWith(removedScriptPrefix)), false);
  assert.equal(manifest.activationEvents?.includes("onStartupFinished"), true);
  assert.equal(manifest.activationEvents?.includes("onCommand:mindflow.copyMcpConfig"), true);
});
