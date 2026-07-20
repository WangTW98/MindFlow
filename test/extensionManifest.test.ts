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
import { FLOW_WEBVIEW_SCRIPT_FILES, FLOW_WEBVIEW_STYLE_FILES, createFlowWebviewHtml, getNonce } from "../src/platform/vscode/editor/canvas/webviewShellHtml";
import { parseWebviewMessage } from "../src/platform/webview/protocol/flowWebviewMessages";
import { assertAppSurfaceEntryEdge, assertNoLegacyFields, assertNoLegacyKeysInJson, assertThrows, createProcurementFlow, FakeMemento, requireNodeByTitle } from "./helpers";

test("Extension manifest contributes standalone .mindflow editor, sidebar, and automatic MCP startup", async () => {
  const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf8");
  const manifest = JSON.parse(raw) as {
    activationEvents?: string[];
    bin?: Record<string, string>;
    displayName?: string;
    description?: string;
    homepage?: string;
    bugs?: { url?: string };
    categories?: string[];
    keywords?: string[];
    license?: string;
    repository?: { type?: string; url?: string };
    scripts?: Record<string, string>;
    contributes?: {
      viewsContainers?: { activitybar?: Array<{ id?: string; icon?: string }> };
      views?: Record<string, Array<{ id?: string; type?: string }>>;
      languages?: Array<{ id?: string; extensions?: string[]; icon?: { light?: string; dark?: string } }>;
      customEditors?: Array<{ viewType?: string; displayName?: string; selector?: Array<{ filenamePattern?: string }> }>;
      commands?: Array<{ command?: string; title?: string }>;
      keybindings?: Array<{ command?: string; key?: string; mac?: string; when?: string }>;
      configuration?: { properties?: Record<string, { default?: string; enum?: string[]; enumDescriptions?: string[]; description?: string }> };
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
  assert.equal(editor.displayName, "MindFlow 产品思维画布");
  assert.ok(editor.selector?.some((item) => item.filenamePattern === "*.mindflow"));
  assert.equal(editor.selector?.some((item) => String(item.filenamePattern || "").endsWith(".json")), false);

  assert.deepEqual(manifest.contributes?.commands?.map((item) => item.command), [
    "mindflow.newFlow",
    "mindflow.openFlow",
    "mindflow.saveFlowAs",
    "mindflow.validateFlowJson",
    "mindflow.copyGlobalMcpConfig",
    "mindflow.exportAgentSkills",
    "mindflow.showMcpConnectionStatus"
  ]);
  assert.deepEqual(manifest.contributes?.commands?.map((item) => item.title), [
    "MindFlow: 新建空白画布",
    "MindFlow: 打开产品流程",
    "MindFlow: 画布另存为...",
    "MindFlow: 校验画布 JSON",
    "MindFlow: 复制全局 MCP 配置",
    "MindFlow: 导出 Agent Skills",
    "MindFlow: 查看 MCP 连接状态"
  ]);
  assert.equal(
    manifest.contributes?.keybindings?.some((item) => item.command === "mindflow.saveFlowAs" && item.mac === "cmd+s") ?? false,
    false
  );
  assert.deepEqual(Object.keys(manifest.contributes?.configuration?.properties ?? {}), [
    "mindflow.storage.flowDirectory",
    "mindflow.security.externalFileAccess"
  ]);
  const flowDirectory = manifest.contributes?.configuration?.properties?.["mindflow.storage.flowDirectory"];
  const externalFileAccess = manifest.contributes?.configuration?.properties?.["mindflow.security.externalFileAccess"];
  assert.equal(flowDirectory?.description, "用于存放 MindFlow ProductFlow 文件的工作区相对目录。");
  assert.equal(externalFileAccess?.description, "控制 MCP 是否可以打开当前 VS Code 工作区之外的本地 .mindflow 文件。");
  assert.equal(externalFileAccess?.enumDescriptions?.length, externalFileAccess?.enum?.length);
  assert.equal(manifest.contributes?.jsonValidation?.[0]?.url, "./assets/product-flow/schema/productFlow.schema.json");
  assert.equal(manifest.bin, undefined);
  const removedScriptPrefix = ["m", "c", "p"].join("") + ":";
  assert.equal(Object.keys(manifest.scripts ?? {}).some((script) => script.startsWith(removedScriptPrefix)), false);
  assert.equal(manifest.activationEvents?.includes("onStartupFinished"), true);
  assert.equal(manifest.activationEvents?.includes("onCommand:mindflow.copyMcpConfig"), false);
  assert.equal(manifest.activationEvents?.includes("onCommand:mindflow.copyGlobalMcpConfig"), true);
  assert.equal(manifest.activationEvents?.includes("onCommand:mindflow.showMcpConnectionStatus"), true);
  assert.equal(manifest.displayName, "MindFlow 产品思维画布");
  assert.ok(manifest.description?.includes("面向产品经理的结构化产品思维画布"));
  assert.equal(manifest.homepage, "https://github.com/WangTW98/MindFlow#readme");
  assert.equal(manifest.bugs?.url, "https://github.com/WangTW98/MindFlow/issues");
  assert.deepEqual(manifest.categories, ["Visualization", "Other"]);
  assert.deepEqual(manifest.keywords, ["产品经理", "思维导图", "产品设计", "业务流程", "MCP", "Agent", "ProductFlow"]);
  assert.equal(manifest.license, "AGPL-3.0-only");
  assert.deepEqual(manifest.repository, {
    type: "git",
    url: "https://github.com/WangTW98/MindFlow.git"
  });
});

test("Chinese GitHub and VSIX descriptions retain AGPL and public source notices", async () => {
  const [licenseText, githubReadmeText, marketplaceReadmeText] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "LICENSE.txt"), "utf8"),
    fs.readFile(path.join(process.cwd(), "README.md"), "utf8"),
    fs.readFile(path.join(process.cwd(), "README.vscode.md"), "utf8")
  ]);
  const canonicalLicenseText = licenseText.replace(/\r\n?/gu, "\n");
  for (const candidate of [canonicalLicenseText, canonicalLicenseText.replace(/\n/gu, "\r\n")]) {
    const normalizedLicenseText = candidate.replace(/\r\n?/gu, "\n");
    assert.ok(normalizedLicenseText.includes("GNU AFFERO GENERAL PUBLIC LICENSE\n                       Version 3, 19 November 2007"));
    assert.ok(normalizedLicenseText.includes("13. Remote Network Interaction; Use with the GNU General Public License."));
    assert.equal(/All rights reserved|proprietary|No permission is granted|UNLICENSED/iu.test(normalizedLicenseText), false);
  }
  assert.ok(githubReadmeText.includes("## 核心能力"));
  assert.ok(githubReadmeText.includes("## 开发与构建"));
  assert.ok(githubReadmeText.includes("## License"));
  assert.ok(marketplaceReadmeText.includes("# MindFlow 产品思维画布"));
  assert.ok(marketplaceReadmeText.includes("尚未发布到 VS Code Marketplace"));
  assert.equal(marketplaceReadmeText.includes("## 开发与构建"), false);
  for (const readmeText of [githubReadmeText, marketplaceReadmeText]) {
    assert.ok(readmeText.includes("AGPL-3.0-only"));
    assert.ok(readmeText.includes("https://github.com/WangTW98/MindFlow"));
  }
});

test("webview CSP nonces are cryptographically-sized and unique", () => {
  const first = getNonce();
  const second = getNonce();
  assert.match(first, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(first, second);
});
