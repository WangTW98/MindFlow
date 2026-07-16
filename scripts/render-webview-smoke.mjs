import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

await import("./build-webview.mjs");

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outputDir = path.join(root, "out", "webview-smoke");
const outputFile = path.join(outputDir, "index.html");

const flow = createSmokeFlow();
await assertCurrentProductFlow(flow);
const initialState = {
  flow,
  flowPath: "smoke.mindflow",
  flowFileName: "smoke.mindflow",
  selectedProjectOverview: false,
  selectedNodeId: "node_workbench",
  selectedEdgeId: null,
  selectedAppSurfaceId: null,
  selectedDomainId: null,
  selectedRoleId: null,
  selectedStatusGroupId: null
};

const styles = [
  "styles.css",
  "styles-layout.css",
  "styles-canvas.css",
  "styles-cards.css",
  "styles-project-overview.css",
  "styles-inspector.css",
  "styles-inspector-pickers.css",
  "styles-inspector-forms.css"
];

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, renderHtml(initialState, styles, Date.now().toString(36)), "utf8");
console.log(pathToFileURL(outputFile).href);

function renderHtml(state, styleFiles, cacheToken) {
  const mediaPrefix = "../../assets/webview/canvas/media";
  const scriptPrefix = "../../out/webview/canvas";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styleFiles.map((fileName) => `<link href="${mediaPrefix}/${fileName}?v=${cacheToken}" rel="stylesheet">`).join("\n  ")}
  <title>MindFlow Smoke Harness</title>
</head>
<body>
  <div id="app"></div>
  <script>
    window.__MINDFLOW_MESSAGES__ = [];
    window.acquireVsCodeApi = function acquireVsCodeApi() {
      return {
        getState: function getState() { return {}; },
        setState: function setState(value) { window.__MINDFLOW_PERSISTED_STATE__ = value; },
        postMessage: function postMessage(message) { window.__MINDFLOW_MESSAGES__.push(message); }
      };
    };
    window.__MINDFLOW_STATE__ = ${JSON.stringify(state).replace(/</g, "\\u003c")};
  </script>
  <script src="${scriptPrefix}/flowEditor.js?v=${cacheToken}"></script>
</body>
</html>`;
}

async function assertCurrentProductFlow(flow) {
  const schemaPath = path.join(root, "assets", "product-flow", "schema", "productFlow.schema.json");
  const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(flow)) {
    throw new Error(`Webview smoke fixture is not a current ProductFlow: ${JSON.stringify(validate.errors)}`);
  }
}

function createSmokeFlow() {
  const now = "2026-07-05T00:00:00.000Z";
  return {
    flowId: "flow_smoke",
    revision: 1,
    title: "MindFlow Smoke",
    createdAt: now,
    updatedAt: now,
    projectOverview: {
      summary: "Smoke test flow for bundled webview rendering.",
      goal: "Verify canvas, cards, edges, taxonomy, and inspector render."
    },
    domains: [
      { domainId: "domain_ops", name: "运营域", description: "运营后台业务域。" }
    ],
    roles: [
      { roleId: "role_operator", name: "运营", description: "负责运营配置。", domainIds: ["domain_ops"] }
    ],
    appSurfaces: [
      {
        appId: "app_admin",
        name: "管理后台",
        type: "admin",
        description: "后台工作台。",
        domainIds: ["domain_ops"],
        roleIds: ["role_operator"],
        view: { position: { x: -360, y: 0 } }
      }
    ],
    statusGroups: [
      { statusGroupId: "status_review", title: "评审中", description: "等待确认。", color: "#33aa55" }
    ],
    nodes: [
      {
        nodeId: "node_workbench",
        status: "active",
        title: "运营工作台",
        pageType: "page",
        appSurfaceIds: ["app_admin"],
        statusGroupId: "status_review",
        domainIds: ["domain_ops"],
        roleIds: ["role_operator"],
        purpose: "查看运营任务和配置入口。",
        featureGroups: [
          {
            groupId: "group_main",
            name: "主要功能",
            type: "section",
            description: "工作台功能。",
            items: [
              { itemId: "item_list", name: "任务列表", type: "table", description: "展示待处理任务。" },
              { itemId: "item_create", name: "新建按钮", type: "button", description: "进入新建页面。" }
            ]
          }
        ],
        inputs: [],
        outputs: [],
        permissions: ["role_operator"],
        view: { position: { x: 80, y: 80 } }
      },
      {
        nodeId: "node_create",
        status: "active",
        title: "配置新建页",
        pageType: "page",
        appSurfaceIds: ["app_admin"],
        domainIds: ["domain_ops"],
        roleIds: ["role_operator"],
        purpose: "创建运营配置。",
        featureGroups: [
          {
            groupId: "group_form",
            name: "表单功能",
            type: "section",
            description: "新建表单功能。",
            items: [
              { itemId: "item_name", name: "配置名称", type: "input", description: "录入配置名称。" },
              { itemId: "item_submit", name: "提交按钮", type: "button", description: "提交配置。" }
            ]
          }
        ],
        inputs: [],
        outputs: [],
        permissions: ["role_operator"],
        view: { position: { x: 480, y: 120 } }
      }
    ],
    edges: [
      {
        edgeId: "edge_enter_admin",
        status: "active",
        fromNodeId: "app_admin",
        toNodeId: "node_workbench",
        from: { kind: "appSurface", nodeId: "app_admin", appId: "app_admin" },
        to: { kind: "node", nodeId: "node_workbench" },
        action: "进入后台",
        trigger: "进入后台",
        type: "nestedRelation",
        appSurfaceIds: ["app_admin"],
        domainIds: ["domain_ops"],
        roleIds: ["role_operator"]
      },
      {
        edgeId: "edge_create",
        status: "active",
        fromNodeId: "node_workbench",
        toNodeId: "node_create",
        from: { kind: "featureItem", nodeId: "node_workbench", groupId: "group_main", itemId: "item_create" },
        to: { kind: "node", nodeId: "node_create" },
        action: "新建配置",
        trigger: "新建配置",
        type: "interaction",
        appSurfaceIds: ["app_admin"],
        domainIds: ["domain_ops"],
        roleIds: ["role_operator"]
      }
    ]
  };
}
