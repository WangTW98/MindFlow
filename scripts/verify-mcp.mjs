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
  assert(listed.tools.some((tool) => tool.name === "mindflow_analyze_document"), "analyze tool missing.");

  const analyzed = await callTool("mindflow_analyze_document", {
    workspaceRoot,
    documentPath: "samples/example-requirements.md"
  }, 180000);
  assert(analyzed.flowPath.endsWith(".mindflow"), "analyzed flow should use .mindflow extension.");
  assert(analyzed.nodeCount >= 12, "sample analysis should create multi-surface nodes.");

  const read = await callTool("mindflow_read_flow", {
    workspaceRoot,
    flowPath: analyzed.flowPath
  });
  const flow = read.flow;
  assert((flow.appSurfaces || []).length >= 4, "flow should contain at least four app surfaces.");
  assert(flow.domains.length >= 6, "flow should contain multiple domains.");
  assert(flow.roles.length >= 6, "flow should contain multiple roles.");
  const entryNodesByApp = findEntryNodesByApp(flow);
  for (const surface of flow.appSurfaces || []) {
    assert((entryNodesByApp.get(surface.appId) || []).length >= 1, `app surface ${surface.appId} should have an entry node.`);
  }
  assertAppSurfaceEntryEdges(flow);

  const { originNode, origin, targetA, targetB } = findVerificationEndpoints(flow);
  const originGroup = originNode.featureGroups?.find((group) => group.groupId === origin.groupId);
  const originItem = originGroup?.items.find((item) => item.itemId === origin.itemId);
  assert(originGroup && originItem, "feature item origin missing.");

  const createdNode = await callTool("mindflow_create_node", {
    workspaceRoot,
    flowPath: analyzed.flowPath,
    title: "MCP 验证页",
    pageType: "debug",
    purpose: "用于验证 MCP 创建节点和画布渲染。",
    x: 1880,
    y: 760,
    appSurfaceIds: ["app_admin"],
    domainIds: ["domain_sourcing"],
    roleIds: ["role_buyer"],
    featureGroups: [
      {
        groupId: "group_mcp_verify",
        name: "验证功能",
        type: "section",
        description: "MCP 自动化验证分组。",
        items: [
          {
            itemId: "item_mcp_verify_submit",
            name: "验证按钮",
            type: "button",
            description: "触发验证动作。"
          }
        ]
      }
    ]
  });
  const createdNodeId = createdNode.result.node.nodeId;

  await callTool("mindflow_create_edge", {
    workspaceRoot,
    flowPath: analyzed.flowPath,
    from: origin,
    toNodeId: targetA.nodeId,
    trigger: "同一功能项出口进入目标 A",
    type: "submit"
  });
  await callTool("mindflow_create_edge", {
    workspaceRoot,
    flowPath: analyzed.flowPath,
    from: origin,
    toNodeId: targetB.nodeId,
    trigger: "同一功能项出口进入目标 B",
    type: "navigate"
  });
  await callTool("mindflow_create_edge", {
    workspaceRoot,
    flowPath: analyzed.flowPath,
    from: { kind: "node", nodeId: createdNodeId },
    toNodeId: originNode.nodeId,
    trigger: "MCP 验证回到原始页面",
    type: "navigate"
  });
  await callTool("mindflow_write_prd", {
    workspaceRoot,
    flowPath: analyzed.flowPath,
    scope: "node",
    nodeId: createdNodeId,
    markdown: "# MCP 验证页 PRD\n\n用于验证 MindFlow MCP 写入节点级 PRD。"
  });
  await callTool("mindflow_write_pencil", {
    workspaceRoot,
    flowPath: analyzed.flowPath,
    scope: "node",
    nodeId: createdNodeId,
    spec: {
      page: "MCP 验证页",
      nodeId: createdNodeId,
      layout: "single-column",
      components: ["验证按钮"]
    }
  });

  const finalRead = await callTool("mindflow_read_flow", {
    workspaceRoot,
    flowPath: analyzed.flowPath
  });
  const finalFlow = finalRead.flow;
  const sameOriginEdges = finalFlow.edges.filter((edge) =>
    edge.status === "active" &&
    edge.from?.kind === origin.kind &&
    edge.from?.nodeId === origin.nodeId &&
    edge.from?.groupId === origin.groupId &&
    edge.from?.itemId === origin.itemId
  );
  assert(sameOriginEdges.length >= 2, "same outlet should connect multiple target nodes.");
  assert(finalFlow.nodes.some((node) => node.nodeId === createdNodeId), "MCP-created node missing.");
  assert(finalFlow.artifacts.prds.some((prd) => prd.nodeId === createdNodeId), "MCP-created PRD ref missing.");
  assert(finalFlow.artifacts.pencils.some((pencil) => pencil.nodeId === createdNodeId), "MCP-created Pencil ref missing.");

  console.log(JSON.stringify({
    ok: true,
    flowPath: analyzed.flowPath,
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

function findEntryNodesByApp(flow) {
  const activeEdges = flow.edges.filter((edge) => edge.status === "active");
  const activeNodes = flow.nodes.filter((node) => node.status === "active");
  const nodesById = new Map(activeNodes.map((node) => [node.nodeId, node]));
  const entries = new Map((flow.appSurfaces || []).map((surface) => [surface.appId, []]));
  for (const node of activeNodes) {
    for (const appId of node.appSurfaceIds || []) {
      const hasSameAppIncoming = activeEdges.some((edge) => {
        if (edge.toNodeId !== node.nodeId) {
          return false;
        }
        const fromNode = nodesById.get(edge.fromNodeId);
        return (fromNode?.appSurfaceIds || []).includes(appId);
      });
      if (!hasSameAppIncoming) {
        const items = entries.get(appId) || [];
        items.push(node.nodeId);
        entries.set(appId, items);
      }
    }
  }
  return entries;
}

function assertAppSurfaceEntryEdges(flow) {
  const activeNodes = flow.nodes.filter((node) => node.status === "active");
  const nodesById = new Map(activeNodes.map((node) => [node.nodeId, node]));
  const activeEdges = flow.edges.filter((edge) => edge.status === "active");
  for (const surface of flow.appSurfaces || []) {
    const edge = activeEdges.find((candidate) => {
      const target = nodesById.get(candidate.toNodeId);
      return candidate.from?.kind === "appSurface" &&
        (candidate.from.appId || candidate.from.nodeId) === surface.appId &&
        target &&
        (target.appSurfaceIds || []).includes(surface.appId);
    });
    assert(edge, `app surface ${surface.appId} should connect to its own entry page.`);
  }
}

function findVerificationEndpoints(flow) {
  const activeNodes = flow.nodes.filter((node) => node.status === "active");
  const originNode = activeNodes.find((node) =>
    node.featureGroups?.some((group) => group.items?.length > 0)
  );
  assert(originNode, "verification origin node with feature items missing.");
  const originGroup = originNode.featureGroups.find((group) => group.items?.length > 0);
  const originItem = originGroup.items[0];
  const targets = activeNodes.filter((node) => node.nodeId !== originNode.nodeId).slice(0, 2);
  assert(targets.length >= 2, "verification needs at least two target nodes.");
  return {
    originNode,
    origin: {
      kind: "featureItem",
      nodeId: originNode.nodeId,
      groupId: originGroup.groupId,
      itemId: originItem.itemId
    },
    targetA: targets[0],
    targetB: targets[1]
  };
}
