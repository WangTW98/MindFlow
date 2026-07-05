import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const workspaceRoot = path.resolve(".");
const server = spawn(process.execPath, ["scripts/mindflow-mcp.mjs"], {
  cwd: workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"]
});

let nextId = 1;
let buffer = "";
const waiters = new Map();

server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) {
      const message = JSON.parse(line);
      const waiter = waiters.get(message.id);
      if (waiter) {
        waiters.delete(message.id);
        waiter(message);
      }
    }
    newlineIndex = buffer.indexOf("\n");
  }
});

server.stderr.setEncoding("utf8");
server.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

try {
  const init = await request("initialize", {});
  assert(init.serverInfo?.name === "mindflow", "MCP server name must be mindflow.");
  const listed = await request("tools/list", {});
  const toolNames = listed.tools.map((tool) => tool.name);
  const expectedTools = [
    "mindflow_list_flows",
    "mindflow_read_flow",
    "mindflow_create_flow",
    "mindflow_generate_flow_from_document",
    "mindflow_validate_flow",
    "mindflow_create_node",
    "mindflow_update_node",
    "mindflow_remove_node",
    "mindflow_create_edge",
    "mindflow_update_edge",
    "mindflow_remove_edge",
    "mindflow_create_connected_node",
    "mindflow_update_layout_positions",
    "mindflow_update_taxonomy",
    "mindflow_propose_change",
    "mindflow_apply_change_plan",
    "mindflow_revert_change_set",
    "mindflow_write_prd",
    "mindflow_generate_prd",
    "mindflow_write_pencil",
    "mindflow_generate_pencil",
    "mindflow_sync_artifacts"
  ];
  for (const toolName of expectedTools) {
    assert(toolNames.includes(toolName), `${toolName} tool missing.`);
  }
  assert(!toolNames.includes("mindflow_analyze_document"), "legacy analyze tool must not be exposed.");
  assert(!JSON.stringify(listed.tools).includes("toNodeId"), "legacy toNodeId shorthand must not be exposed.");

  const created = await callTool("mindflow_create_flow", {
    workspaceRoot,
    title: "MCP 验证 Flow",
    sourceDocumentId: "mcp-verify",
    sourceSummary: "本地 MCP 协议和写入验证。"
  });
  assert(created.flowPath.endsWith(".mindflow"), "created flow should use .mindflow extension.");

  await callTool("mindflow_update_taxonomy", {
    workspaceRoot,
    flowPath: created.flowPath,
    kind: "domain",
    action: "create",
    id: "domain_verify",
    item: { name: "验证业务域", description: "MCP 验证业务域。" }
  });
  await callTool("mindflow_update_taxonomy", {
    workspaceRoot,
    flowPath: created.flowPath,
    kind: "role",
    action: "create",
    id: "role_verify",
    item: { name: "验证角色", description: "MCP 验证角色。", domainIds: ["domain_verify"] }
  });
  await callTool("mindflow_update_taxonomy", {
    workspaceRoot,
    flowPath: created.flowPath,
    kind: "appSurface",
    action: "create",
    id: "app_verify",
    item: {
      name: "验证工作台",
      type: "desktop",
      description: "MCP 验证应用端。",
      domainIds: ["domain_verify"],
      roleIds: ["role_verify"]
    }
  });

  const origin = await callTool("mindflow_create_node", {
    workspaceRoot,
    flowPath: created.flowPath,
    title: "验证起点",
    pageType: "form",
    purpose: "发起 MCP 验证动作。",
    x: 120,
    y: 160,
    appSurfaceIds: ["app_verify"],
    domainIds: ["domain_verify"],
    roleIds: ["role_verify"],
    featureGroups: [
      {
        groupId: "group_verify",
        name: "验证操作",
        type: "section",
        description: "MCP 验证分组。",
        items: [
          {
            itemId: "item_verify_submit",
            name: "提交验证",
            type: "button",
            description: "触发验证动作。"
          }
        ]
      }
    ]
  });
  const targetA = await callTool("mindflow_create_node", {
    workspaceRoot,
    flowPath: created.flowPath,
    title: "验证目标 A",
    pageType: "debug",
    purpose: "验证第一个目标页面。",
    x: 520,
    y: 120,
    appSurfaceIds: ["app_verify"],
    domainIds: ["domain_verify"],
    roleIds: ["role_verify"]
  });
  const targetB = await callTool("mindflow_create_node", {
    workspaceRoot,
    flowPath: created.flowPath,
    title: "验证目标 B",
    pageType: "debug",
    purpose: "验证第二个目标页面。",
    x: 520,
    y: 380,
    appSurfaceIds: ["app_verify"],
    domainIds: ["domain_verify"],
    roleIds: ["role_verify"]
  });

  const originNodeId = origin.result.node.nodeId;
  const targetAId = targetA.result.node.nodeId;
  const targetBId = targetB.result.node.nodeId;
  const featureOrigin = {
    kind: "featureItem",
    nodeId: originNodeId,
    groupId: "group_verify",
    itemId: "item_verify_submit"
  };

  await callTool("mindflow_create_edge", {
    workspaceRoot,
    flowPath: created.flowPath,
    from: featureOrigin,
    to: { kind: "node", nodeId: targetAId },
    trigger: "同一功能项出口进入目标 A",
    type: "submit"
  });
  await callTool("mindflow_create_edge", {
    workspaceRoot,
    flowPath: created.flowPath,
    from: featureOrigin,
    to: { kind: "node", nodeId: targetBId },
    trigger: "同一功能项出口进入目标 B",
    type: "navigate"
  });
  const connected = await callTool("mindflow_create_connected_node", {
    workspaceRoot,
    flowPath: created.flowPath,
    from: { kind: "node", nodeId: targetAId },
    x: 920,
    y: 220,
    trigger: "创建后自动连接",
    type: "navigate",
    appSurfaceIds: ["app_verify"],
    domainIds: ["domain_verify"],
    roleIds: ["role_verify"]
  });
  const connectedNodeId = connected.result.node.nodeId;

  await callTool("mindflow_update_layout_positions", {
    workspaceRoot,
    flowPath: created.flowPath,
    nodes: [
      { nodeId: originNodeId, x: 160, y: 180 },
      { nodeId: connectedNodeId, x: 960, y: 260 }
    ],
    appSurfaces: [
      { appId: "app_verify", x: 80, y: 80 }
    ]
  });
  await callTool("mindflow_write_prd", {
    workspaceRoot,
    flowPath: created.flowPath,
    scope: "node",
    nodeId: connectedNodeId,
    markdown: "# MCP 验证页 PRD\n\n用于验证 MindFlow MCP 写入节点级 PRD。"
  });
  await callTool("mindflow_write_pencil", {
    workspaceRoot,
    flowPath: created.flowPath,
    scope: "node",
    nodeId: connectedNodeId,
    spec: {
      page: "MCP 验证页",
      nodeId: connectedNodeId,
      layout: "single-column",
      components: ["验证按钮"]
    }
  });
  await callTool("mindflow_sync_artifacts", {
    workspaceRoot,
    flowPath: created.flowPath
  });

  const validation = await callTool("mindflow_validate_flow", {
    workspaceRoot,
    flowPath: created.flowPath
  });
  assert(validation.valid, `created flow should validate: ${(validation.errors || []).join("; ")}`);

  const finalRead = await callTool("mindflow_read_flow", {
    workspaceRoot,
    flowPath: created.flowPath
  });
  const finalFlow = finalRead.flow;
  const sameOriginEdges = finalFlow.edges.filter((edge) =>
    edge.status === "active" &&
    edge.from?.kind === featureOrigin.kind &&
    edge.from?.nodeId === featureOrigin.nodeId &&
    edge.from?.groupId === featureOrigin.groupId &&
    edge.from?.itemId === featureOrigin.itemId
  );
  assert(sameOriginEdges.length >= 2, "same outlet should connect multiple target nodes.");
  assert(finalFlow.domains.some((domain) => domain.domainId === "domain_verify"), "MCP-created domain missing.");
  assert(finalFlow.roles.some((role) => role.roleId === "role_verify"), "MCP-created role missing.");
  assert((finalFlow.appSurfaces || []).some((surface) => surface.appId === "app_verify"), "MCP-created app surface missing.");
  assert(finalFlow.nodes.some((node) => node.nodeId === connectedNodeId), "MCP-created connected node missing.");
  assert(finalFlow.artifacts.prds.some((prd) => prd.nodeId === connectedNodeId), "MCP-created PRD ref missing.");
  assert(finalFlow.artifacts.pencils.some((pencil) => pencil.nodeId === connectedNodeId), "MCP-created Pencil ref missing.");

  console.log(JSON.stringify({
    ok: true,
    flowPath: created.flowPath,
    nodeCount: finalFlow.nodes.length,
    edgeCount: finalFlow.edges.filter((edge) => edge.status === "active").length,
    sameOriginEdgeCount: sameOriginEdges.length,
    prdCount: finalFlow.artifacts.prds.length,
    pencilCount: finalFlow.artifacts.pencils.length
  }, null, 2));
} finally {
  server.stdin.end();
  await once(server, "close");
}

function request(method, params, timeoutMs = 20000) {
  const id = nextId++;
  const payload = { jsonrpc: "2.0", id, method, params };
  const response = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, timeoutMs);
    waiters.set(id, (message) => {
      clearTimeout(timeout);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    });
  });
  server.stdin.write(`${JSON.stringify(payload)}\n`);
  return response;
}

async function callTool(name, args, timeoutMs = 20000) {
  const result = await request("tools/call", {
    name,
    arguments: args
  }, timeoutMs);
  return JSON.parse(result.content[0].text);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
