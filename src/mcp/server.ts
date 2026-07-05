#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { PencilArtifact, PrdArtifact } from "../agents/AgentProvider";
import { createConfiguredAgentProvider, parseAgentProviderId } from "../agents/providerRuntime";
import { applyFlowChangePlan } from "../changes/flowChangeApplier";
import { proposeValidatedFlowChange } from "../changes/flowChangePlanner";
import { summarizeChangePlan } from "../changes/flowDiff";
import { revertLastChangeSet } from "../changes/revertChangeSet";
import { createEmptyProductFlow } from "../core/emptyFlow";
import {
  createManualEdge,
  createManualNode,
  removeManualEdge,
  removeManualNode,
  updateManualAppSurfacePosition,
  updateManualEdgeDetails,
  updateManualNodeDetails,
  updateManualNodePosition
} from "../core/flowEditing";
import { applyTaxonomyRequest, type TaxonomyRequest } from "../core/taxonomy";
import type { FlowChangePlan } from "../models/flowChange";
import type { EdgeType, FeatureGroup, FlowEndpoint, PageNode, ProductFlow } from "../models/productFlow";
import { validateProductFlow } from "../models/productFlow";
import { ArtifactRepository } from "../storage/artifactRepository";
import { FlowRepository, writeJsonAtomic } from "../storage/flowRepository";
import { applySyncReport, buildSyncReport, collectArtifactSnapshots } from "../sync/syncArtifacts";
import { makePencilId, makePrdId, nowIso } from "../utils/id";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const serverInfo = {
  name: "mindflow",
  version: "0.1.0"
};

const serverInstructions = [
  "Use MindFlow MCP tools for all AI-assisted ProductFlow creation, document analysis, flow changes, and artifact generation.",
  "The VSCode extension is only a .mindflow canvas editor; call these tools rather than expecting VSCode commands to generate content.",
  "Prefer targeted node, edge, taxonomy, and layout tools over rewriting whole flow files."
].join(" ");

const tools: ToolDefinition[] = [
  {
    name: "mindflow_list_flows",
    description: "List MindFlow ProductFlow files in the MindFlow workspace.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root. Defaults to MINDFLOW_WORKSPACE or current working directory."),
      flowDirectory: stringSchema("Workspace-relative flow directory. Defaults to .mindflow/flows.")
    })
  },
  {
    name: "mindflow_read_flow",
    description: "Read the latest or specified MindFlow ProductFlow file.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowDirectory: stringSchema("Workspace-relative flow directory."),
      flowPath: stringSchema("Absolute or workspace-relative .mindflow path. Defaults to latest flow.")
    })
  },
  {
    name: "mindflow_create_flow",
    description: "Create a blank .mindflow ProductFlow file for manual canvas editing.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root. Defaults to MINDFLOW_WORKSPACE or current working directory."),
      flowDirectory: stringSchema("Workspace-relative flow directory. Defaults to .mindflow/flows."),
      title: stringSchema("Flow title. Defaults to Untitled MindFlow."),
      sourceDocumentId: stringSchema("Optional source document id. Defaults to manual."),
      sourceSummary: stringSchema("Optional source summary.")
    })
  },
  {
    name: "mindflow_generate_flow_from_document",
    description: "Use the configured AI provider to analyze requirements text into a .mindflow ProductFlow file.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root. Defaults to MINDFLOW_WORKSPACE or current working directory."),
      flowDirectory: stringSchema("Workspace-relative flow directory. Defaults to .mindflow/flows."),
      documentPath: stringSchema("Absolute or workspace-relative Markdown/TXT document path."),
      documentText: stringSchema("Document text. Used when documentPath is omitted."),
      documentName: stringSchema("Document name used for flow title and source ids."),
      provider: stringSchema("AI provider. Defaults to MINDFLOW_AGENT_PROVIDER or codex. Supported values: codex, gemini."),
      endpoint: stringSchema("Provider HTTP endpoint. Optional for codex when using Codex CLI."),
      model: stringSchema("Provider model name."),
      apiKey: stringSchema("Provider API key. Defaults to MINDFLOW_AGENT_API_KEY or provider-specific env vars."),
      codexCliPath: stringSchema("Codex CLI path. Defaults to MINDFLOW_CODEX_CLI_PATH or codex.")
    })
  },
  {
    name: "mindflow_validate_flow",
    description: "Validate a MindFlow ProductFlow file and return schema errors and warnings.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowDirectory: stringSchema("Workspace-relative flow directory."),
      flowPath: stringSchema("Absolute or workspace-relative .mindflow path. Defaults to latest flow.")
    })
  },
  {
    name: "mindflow_create_node",
    description: "Create a page node at a canvas position.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      title: stringSchema("Node title."),
      pageType: stringSchema("Page type."),
      purpose: stringSchema("Page purpose."),
      x: numberSchema("Canvas x position."),
      y: numberSchema("Canvas y position."),
      appSurfaceIds: arraySchema("Application surface ids."),
      domainIds: arraySchema("Business domain ids."),
      roleIds: arraySchema("User role ids."),
      featureGroups: arraySchema("Feature groups and feature items.")
    })
  },
  {
    name: "mindflow_update_node",
    description: "Update a node's title, purpose, app surfaces, domains, roles, and feature groups.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      nodeId: stringSchema("Node id."),
      patch: objectSchema({}, "Node patch.")
    }, ["nodeId"])
  },
  {
    name: "mindflow_remove_node",
    description: "Soft remove a node and its active incident edges from the flow.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      nodeId: stringSchema("Node id.")
    }, ["nodeId"])
  },
  {
    name: "mindflow_create_edge",
    description: "Create a flow edge. The origin and target may be nodes, feature groups, feature items, or app surfaces.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      from: objectSchema({}, "FlowEndpoint origin."),
      to: objectSchema({}, "FlowEndpoint target."),
      trigger: stringSchema("Business trigger text shown on the edge."),
      type: stringSchema("Edge type.")
    }, ["from", "to"])
  },
  {
    name: "mindflow_update_edge",
    description: "Update edge trigger text, condition, type, domains, and roles.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      edgeId: stringSchema("Edge id."),
      patch: objectSchema({}, "Edge patch.")
    }, ["edgeId"])
  },
  {
    name: "mindflow_remove_edge",
    description: "Soft remove an edge from the flow.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      edgeId: stringSchema("Edge id.")
    }, ["edgeId"])
  },
  {
    name: "mindflow_create_connected_node",
    description: "Create a new node at a canvas position and connect it from or to an existing endpoint.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      from: objectSchema({}, "Optional origin endpoint. If present, connects origin to the new node."),
      to: objectSchema({}, "Optional target endpoint. If present, connects new node to target."),
      x: numberSchema("Canvas x position."),
      y: numberSchema("Canvas y position."),
      trigger: stringSchema("Business trigger text shown on the new edge."),
      type: stringSchema("Edge type."),
      appSurfaceIds: arraySchema("Application surface ids."),
      domainIds: arraySchema("Business domain ids."),
      roleIds: arraySchema("User role ids.")
    })
  },
  {
    name: "mindflow_update_layout_positions",
    description: "Batch update node and app surface canvas positions.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      nodes: arraySchema("Array of {nodeId, x, y}."),
      appSurfaces: arraySchema("Array of {appId, x, y}.")
    })
  },
  {
    name: "mindflow_update_taxonomy",
    description: "Create, update, or delete app surfaces, domains, roles, and status groups.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      kind: stringSchema("Taxonomy kind: appSurface, domain, role, or statusGroup."),
      action: stringSchema("Action: create, update, or delete."),
      id: stringSchema("Existing taxonomy id for update/delete."),
      item: objectSchema({}, "Taxonomy item payload.")
    }, ["kind", "action"])
  },
  {
    name: "mindflow_propose_change",
    description: "Use the configured AI provider to turn a natural-language instruction into a validated FlowChangePlan.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      instruction: stringSchema("Natural-language flow change instruction."),
      selectedNodeId: stringSchema("Optional selected node id for context."),
      provider: stringSchema("AI provider. Defaults to MINDFLOW_AGENT_PROVIDER or codex."),
      endpoint: stringSchema("Provider HTTP endpoint. Optional for codex when using Codex CLI."),
      model: stringSchema("Provider model name."),
      apiKey: stringSchema("Provider API key."),
      codexCliPath: stringSchema("Codex CLI path.")
    }, ["instruction"])
  },
  {
    name: "mindflow_apply_change_plan",
    description: "Apply a FlowChangePlan to a ProductFlow file and save the resulting revision.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      plan: objectSchema({}, "FlowChangePlan to apply."),
      confirmedDestructive: { type: "boolean", description: "Set true to allow operations requiring confirmation." }
    }, ["plan"])
  },
  {
    name: "mindflow_revert_change_set",
    description: "Revert the latest applied ChangeSet stored in changeHistory.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path.")
    })
  },
  {
    name: "mindflow_write_prd",
    description: "Write a provided node or full PRD Markdown artifact and link it to the MindFlow ProductFlow file.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      scope: stringSchema("node or full."),
      nodeId: stringSchema("Required for node PRD."),
      markdown: stringSchema("PRD Markdown body."),
      prdId: stringSchema("Optional stable PRD id.")
    }, ["markdown"])
  },
  {
    name: "mindflow_generate_prd",
    description: "Use the configured AI provider to generate and write a node or full PRD artifact.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      scope: stringSchema("node or full."),
      nodeId: stringSchema("Required for node PRD."),
      provider: stringSchema("AI provider used when markdown is omitted. Defaults to MINDFLOW_AGENT_PROVIDER or codex."),
      endpoint: stringSchema("Provider HTTP endpoint. Optional for codex when using Codex CLI."),
      model: stringSchema("Provider model name."),
      apiKey: stringSchema("Provider API key. Defaults to MINDFLOW_AGENT_API_KEY or provider-specific env vars."),
      codexCliPath: stringSchema("Codex CLI path. Defaults to MINDFLOW_CODEX_CLI_PATH or codex.")
    })
  },
  {
    name: "mindflow_write_pencil",
    description: "Write a provided node or full Pencil design spec and link it to the MindFlow ProductFlow file.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      scope: stringSchema("node or full."),
      nodeId: stringSchema("Required for node Pencil spec."),
      spec: objectSchema({}, "Pencil spec object."),
      pencilId: stringSchema("Optional stable Pencil id.")
    }, ["spec"])
  },
  {
    name: "mindflow_generate_pencil",
    description: "Use the configured AI provider to generate and write a node or full Pencil design spec.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      scope: stringSchema("node or full."),
      nodeId: stringSchema("Required for node Pencil spec."),
      provider: stringSchema("AI provider used when spec is omitted. Defaults to MINDFLOW_AGENT_PROVIDER or codex."),
      endpoint: stringSchema("Provider HTTP endpoint. Optional for codex when using Codex CLI."),
      model: stringSchema("Provider model name."),
      apiKey: stringSchema("Provider API key. Defaults to MINDFLOW_AGENT_API_KEY or provider-specific env vars."),
      codexCliPath: stringSchema("Codex CLI path. Defaults to MINDFLOW_CODEX_CLI_PATH or codex.")
    })
  },
  {
    name: "mindflow_sync_artifacts",
    description: "Inspect PRD/Pencil artifact metadata, update ProductFlow artifact status, and write a sync report.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path.")
    })
  }
];

let inputBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  inputBuffer += chunk;
  drainInput();
});
process.stdin.on("end", () => {
  drainInput();
});

function drainInput(): void {
  let newlineIndex = inputBuffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = inputBuffer.slice(0, newlineIndex).trim();
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    if (line.length > 0) {
      void handleRawMessage(line);
    }
    newlineIndex = inputBuffer.indexOf("\n");
  }
}

async function handleRawMessage(line: string): Promise<void> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch (error) {
    writeError(null, -32700, `Parse error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (request.id === undefined) {
    return;
  }
  try {
    const result = await handleRequest(request);
    writeResult(request.id, result);
  } catch (error) {
    writeError(request.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo,
        instructions: serverInstructions
      };
    case "tools/list":
      return { tools };
    case "tools/call":
      return callTool(asRecord(request.params));
    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
}

async function callTool(params: Record<string, unknown>): Promise<unknown> {
  const name = requireString(params, "name");
  const args = asRecord(params.arguments);
  const result = await executeTool(name, args);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "mindflow_list_flows":
      return listFlows(args);
    case "mindflow_read_flow":
      return readFlow(args);
    case "mindflow_create_flow":
      return createFlow(args);
    case "mindflow_generate_flow_from_document":
      return generateFlowFromDocument(args);
    case "mindflow_validate_flow":
      return validateFlow(args);
    case "mindflow_create_node":
      return mutateFlow(args, (flow) => {
        const node = createManualNode(flow, {
          title: optionalString(args.title),
          pageType: optionalString(args.pageType),
          purpose: optionalString(args.purpose),
          x: optionalNumber(args.x),
          y: optionalNumber(args.y),
          appSurfaceIds: optionalStringArray(args.appSurfaceIds),
          domainIds: optionalStringArray(args.domainIds),
          roleIds: optionalStringArray(args.roleIds),
          featureGroups: Array.isArray(args.featureGroups) ? args.featureGroups as FeatureGroup[] : undefined
        });
        return { node };
      });
    case "mindflow_update_node":
      return mutateFlow(args, (flow) => {
        const node = updateManualNodeDetails(flow, requireString(args, "nodeId"), asRecord(args.patch));
        return { node };
      });
    case "mindflow_remove_node":
      return mutateFlow(args, (flow) => {
        const result = removeManualNode(flow, requireString(args, "nodeId"));
        return result;
      });
    case "mindflow_create_edge":
      return mutateFlow(args, (flow) => {
        const edge = createManualEdge(flow, {
          from: asRecord(args.from) as unknown as FlowEndpoint,
          to: asRecord(args.to) as unknown as FlowEndpoint,
          trigger: optionalString(args.trigger),
          type: optionalString(args.type) as EdgeType | undefined
        });
        return { edge };
      });
    case "mindflow_update_edge":
      return mutateFlow(args, (flow) => {
        const edge = updateManualEdgeDetails(flow, requireString(args, "edgeId"), asRecord(args.patch));
        return { edge };
      });
    case "mindflow_remove_edge":
      return mutateFlow(args, (flow) => {
        const edge = removeManualEdge(flow, requireString(args, "edgeId"));
        return { edge };
      });
    case "mindflow_create_connected_node":
      return mutateFlow(args, (flow) => createConnectedNode(flow, args));
    case "mindflow_update_layout_positions":
      return mutateFlow(args, (flow) => updateLayoutPositions(flow, args));
    case "mindflow_update_taxonomy":
      return mutateFlow(args, (flow) => {
        applyTaxonomyRequest(flow, {
          kind: requireString(args, "kind") as TaxonomyRequest["kind"],
          action: requireString(args, "action") as TaxonomyRequest["action"],
          id: optionalString(args.id),
          item: asRecord(args.item)
        });
        return { flow };
      });
    case "mindflow_propose_change":
      return proposeChange(args);
    case "mindflow_apply_change_plan":
      return applyChangePlan(args);
    case "mindflow_revert_change_set":
      return revertChangeSet(args);
    case "mindflow_write_prd":
      return writePrd(args);
    case "mindflow_generate_prd":
      return generatePrd(args);
    case "mindflow_write_pencil":
      return writePencil(args);
    case "mindflow_generate_pencil":
      return generatePencil(args);
    case "mindflow_sync_artifacts":
      return syncArtifacts(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function createFlow(args: Record<string, unknown>): Promise<unknown> {
  const workspaceRoot = getWorkspaceRoot(args);
  const repository = createRepository(args);
  const flow = createEmptyProductFlow(optionalString(args.title));
  if (typeof args.sourceDocumentId === "string" && args.sourceDocumentId.trim()) {
    flow.sourceDocumentId = args.sourceDocumentId.trim();
  }
  if (typeof args.sourceSummary === "string") {
    flow.sourceSummary = args.sourceSummary.trim();
  }
  const flowPath = await repository.save(flow);
  return flowResult(workspaceRoot, repository, flowPath, flow);
}

async function generateFlowFromDocument(args: Record<string, unknown>): Promise<unknown> {
  const workspaceRoot = getWorkspaceRoot(args);
  const repository = createRepository(args);
  const documentPathArg = optionalString(args.documentPath);
  const documentPath = documentPathArg
    ? path.isAbsolute(documentPathArg) ? documentPathArg : path.join(workspaceRoot, documentPathArg)
    : undefined;
  const documentText = documentPath ? await fs.readFile(documentPath, "utf8") : requireString(args, "documentText");
  const documentName = optionalString(args.documentName) || (documentPath ? path.basename(documentPath) : "requirements.md");
  const provider = createMcpAgentProvider(args, workspaceRoot);
  const flow = await provider.analyzeDocument({
    documentText,
    documentName,
    sourceDocumentId: documentPath ?? documentName
  });
  const flowPath = await repository.save(flow);
  return flowResult(workspaceRoot, repository, flowPath, flow);
}

function flowResult(workspaceRoot: string, repository: FlowRepository, flowPath: string, flow: ProductFlow): Record<string, unknown> {
  return {
    workspaceRoot,
    flowPath: repository.relativePath(flowPath),
    flowId: flow.flowId,
    revision: flow.revision,
    nodeCount: flow.nodes.length,
    edgeCount: flow.edges.filter((edge) => edge.status === "active").length
  };
}

async function listFlows(args: Record<string, unknown>): Promise<unknown> {
  const workspaceRoot = getWorkspaceRoot(args);
  const repository = createRepository(args);
  const files = await repository.list();
  const latest = await repository.latest();
  return {
    workspaceRoot,
    files: files.map((file) => ({
      path: path.relative(workspaceRoot, file),
      absolutePath: file,
      latest: file === latest
    }))
  };
}

async function readFlow(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow } = await loadFlow(args);
  return {
    flowPath: repository.relativePath(flowPath),
    flow
  };
}

async function validateFlow(args: Record<string, unknown>): Promise<unknown> {
  const workspaceRoot = getWorkspaceRoot(args);
  const repository = createRepository(args);
  const flowPath = await resolveFlowPath(args, repository, workspaceRoot);
  const raw = await fs.readFile(flowPath, "utf8");
  try {
    const parsed = JSON.parse(raw) as unknown;
    const validation = validateProductFlow(parsed);
    return {
      flowPath: repository.relativePath(flowPath),
      ...validation
    };
  } catch (error) {
    return {
      flowPath: repository.relativePath(flowPath),
      valid: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
      warnings: []
    };
  }
}

function createConnectedNode(flow: ProductFlow, args: Record<string, unknown>): unknown {
  const from = isRecord(args.from) ? args.from as unknown as FlowEndpoint : undefined;
  const to = isRecord(args.to) ? args.to as unknown as FlowEndpoint : undefined;
  if (!from && !to) {
    throw new Error("create_connected_node requires from or to.");
  }
  const relatedNode = from
    ? from.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === from.nodeId)
    : to?.kind === "appSurface" ? undefined : flow.nodes.find((node) => node.nodeId === to?.nodeId);
  const relatedAppSurfaceIds = from?.kind === "appSurface"
    ? [from.appId ?? from.nodeId]
    : to?.kind === "appSurface"
      ? [to.appId ?? to.nodeId]
      : relatedNode?.appSurfaceIds;
  const node = createManualNode(flow, {
    x: optionalNumber(args.x),
    y: optionalNumber(args.y),
    appSurfaceIds: nonEmptyArrayOr(optionalStringArray(args.appSurfaceIds), relatedAppSurfaceIds),
    domainIds: nonEmptyArrayOr(optionalStringArray(args.domainIds), relatedNode?.domainIds),
    roleIds: nonEmptyArrayOr(optionalStringArray(args.roleIds), relatedNode?.roleIds)
  });
  const edges: ReturnType<typeof createManualEdge>[] = [];
  if (from) {
    edges.push(createManualEdge(flow, {
      from,
      to: { kind: "node", nodeId: node.nodeId },
      trigger: optionalString(args.trigger),
      type: optionalString(args.type) as EdgeType | undefined
    }));
  } else if (to) {
    edges.push(createManualEdge(flow, {
      from: { kind: "node", nodeId: node.nodeId },
      to,
      trigger: optionalString(args.trigger),
      type: optionalString(args.type) as EdgeType | undefined
    }));
  }
  return { node, edges };
}

function updateLayoutPositions(flow: ProductFlow, args: Record<string, unknown>): unknown {
  const updatedNodes = [];
  const updatedAppSurfaces = [];
  for (const item of recordArray(args.nodes)) {
    const nodeId = optionalString(item.nodeId);
    const x = optionalNumber(item.x);
    const y = optionalNumber(item.y);
    if (nodeId && x !== undefined && y !== undefined) {
      updatedNodes.push(updateManualNodePosition(flow, nodeId, x, y));
    }
  }
  for (const item of recordArray(args.appSurfaces)) {
    const appId = optionalString(item.appId);
    const x = optionalNumber(item.x);
    const y = optionalNumber(item.y);
    if (appId && x !== undefined && y !== undefined) {
      updatedAppSurfaces.push(updateManualAppSurfacePosition(flow, appId, x, y));
    }
  }
  return { updatedNodes, updatedAppSurfaces };
}

async function proposeChange(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow, workspaceRoot } = await loadFlow(args);
  const provider = createMcpAgentProvider(args, workspaceRoot);
  const plan = await proposeValidatedFlowChange(
    provider,
    flow,
    requireString(args, "instruction"),
    optionalString(args.selectedNodeId)
  );
  return {
    flowPath: repository.relativePath(flowPath),
    summary: summarizeChangePlan(plan),
    plan
  };
}

async function applyChangePlan(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow } = await loadFlow(args);
  const plan = asRecord(args.plan) as unknown as FlowChangePlan;
  const next = applyFlowChangePlan(flow, plan, { confirmedDestructive: optionalBoolean(args.confirmedDestructive) });
  await repository.saveToPath(flowPath, next);
  return {
    flowPath: repository.relativePath(flowPath),
    revision: next.revision,
    summary: summarizeChangePlan(plan),
    flow: next
  };
}

async function revertChangeSet(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow } = await loadFlow(args);
  const next = revertLastChangeSet(flow);
  await repository.saveToPath(flowPath, next);
  return {
    flowPath: repository.relativePath(flowPath),
    revision: next.revision,
    flow: next
  };
}

async function mutateFlow(
  args: Record<string, unknown>,
  mutator: (flow: ProductFlow) => unknown
): Promise<unknown> {
  const { repository, flowPath, flow } = await loadFlow(args);
  const result = mutator(flow);
  await repository.saveToPath(flowPath, flow);
  return {
    flowPath: repository.relativePath(flowPath),
    revision: flow.revision,
    result
  };
}

async function writePrd(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow, workspaceRoot } = await loadFlow(args);
  const scope = optionalString(args.scope) === "full" ? "full" : "node";
  const node = scope === "node" ? requireNode(flow, optionalString(args.nodeId)) : undefined;
  const now = nowIso();
  const artifact: PrdArtifact = {
    metadata: {
      prdId: optionalString(args.prdId) || makePrdId(`${flow.flowId}:${scope}:${node?.nodeId ?? "full"}`),
      flowId: flow.flowId,
      scope,
      nodeId: node?.nodeId,
      linkedPencilIds: node ? [...node.artifacts.pencilIds] : flow.artifacts.pencils.map((item) => item.pencilId),
      linkedJsonPath: repository.relativePath(flowPath),
      generatedBy: "mcp",
      createdAt: now,
      updatedAt: now
    },
    markdown: requireString(args, "markdown")
  };
  const written = await new ArtifactRepository(workspaceRoot).writePrd(flow, artifact);
  await repository.saveToPath(flowPath, flow);
  return {
    flowPath: repository.relativePath(flowPath),
    prd: written.ref,
    path: written.relativePath
  };
}

async function generatePrd(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow, workspaceRoot } = await loadFlow(args);
  const scope = optionalString(args.scope) === "full" ? "full" : "node";
  const node = scope === "node" ? requireNode(flow, optionalString(args.nodeId)) : undefined;
  const provider = createMcpAgentProvider(args, workspaceRoot);
  const artifact = node
    ? await provider.generateNodePrd(flow, node, optionalString(args.changeSetId))
    : await provider.generateFullPrd(flow, optionalString(args.changeSetId));
  artifact.metadata.generatedBy = "mcp";
  artifact.metadata.linkedJsonPath = repository.relativePath(flowPath);
  const written = await new ArtifactRepository(workspaceRoot).writePrd(flow, artifact);
  await repository.saveToPath(flowPath, flow);
  return {
    flowPath: repository.relativePath(flowPath),
    prd: written.ref,
    path: written.relativePath
  };
}

async function writePencil(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow, workspaceRoot } = await loadFlow(args);
  const scope = optionalString(args.scope) === "full" ? "full" : "node";
  const node = scope === "node" ? requireNode(flow, optionalString(args.nodeId)) : undefined;
  const now = nowIso();
  const artifact: PencilArtifact = {
    metadata: {
      pencilId: optionalString(args.pencilId) || makePencilId(`${flow.flowId}:${scope}:${node?.nodeId ?? "full"}`),
      flowId: flow.flowId,
      scope,
      nodeId: node?.nodeId,
      linkedPrdIds: node ? [...node.artifacts.prdIds] : flow.artifacts.prds.map((item) => item.prdId),
      linkedJsonPath: repository.relativePath(flowPath),
      generatedBy: "mcp",
      createdAt: now,
      updatedAt: now
    },
    spec: requireRecord(args, "spec")
  };
  const written = await new ArtifactRepository(workspaceRoot).writePencil(flow, artifact);
  await repository.saveToPath(flowPath, flow);
  return {
    flowPath: repository.relativePath(flowPath),
    pencil: written.ref,
    path: written.relativePath
  };
}

async function generatePencil(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow, workspaceRoot } = await loadFlow(args);
  const scope = optionalString(args.scope) === "full" ? "full" : "node";
  const node = scope === "node" ? requireNode(flow, optionalString(args.nodeId)) : undefined;
  const provider = createMcpAgentProvider(args, workspaceRoot);
  const artifact = node
    ? await provider.generateNodePencil(flow, node, optionalString(args.changeSetId))
    : await provider.generateFullPencil(flow, optionalString(args.changeSetId));
  artifact.metadata.generatedBy = "mcp";
  artifact.metadata.linkedJsonPath = repository.relativePath(flowPath);
  const written = await new ArtifactRepository(workspaceRoot).writePencil(flow, artifact);
  await repository.saveToPath(flowPath, flow);
  return {
    flowPath: repository.relativePath(flowPath),
    pencil: written.ref,
    path: written.relativePath
  };
}

async function syncArtifacts(args: Record<string, unknown>): Promise<unknown> {
  const { repository, flowPath, flow, workspaceRoot } = await loadFlow(args);
  const snapshots = collectArtifactSnapshots(workspaceRoot, flow);
  const report = buildSyncReport(flow, snapshots);
  const next = applySyncReport(flow, report);
  await repository.saveToPath(flowPath, next);
  const reportPath = path.join(workspaceRoot, ".mindflow", `sync-report-${flow.flowId}.json`);
  await writeJsonAtomic(reportPath, report);
  return {
    flowPath: repository.relativePath(flowPath),
    reportPath: path.relative(workspaceRoot, reportPath),
    report,
    revision: next.revision
  };
}

async function loadFlow(args: Record<string, unknown>): Promise<{
  workspaceRoot: string;
  repository: FlowRepository;
  flowPath: string;
  flow: ProductFlow;
}> {
  const workspaceRoot = getWorkspaceRoot(args);
  const repository = createRepository(args);
  const flowPath = await resolveFlowPath(args, repository, workspaceRoot);
  const flow = await repository.load(flowPath);
  return { workspaceRoot, repository, flowPath, flow };
}

async function resolveFlowPath(args: Record<string, unknown>, repository: FlowRepository, workspaceRoot: string): Promise<string> {
  const requestedPath = optionalString(args.flowPath);
  const flowPath = requestedPath
    ? path.isAbsolute(requestedPath) ? requestedPath : path.join(workspaceRoot, requestedPath)
    : await repository.latest();
  if (!flowPath) {
    throw new Error("No MindFlow ProductFlow file exists.");
  }
  return flowPath;
}

function createRepository(args: Record<string, unknown>): FlowRepository {
  return new FlowRepository(getWorkspaceRoot(args), optionalString(args.flowDirectory) || ".mindflow/flows");
}

function getWorkspaceRoot(args: Record<string, unknown>): string {
  const fromArgs = optionalString(args.workspaceRoot);
  if (fromArgs) {
    return path.isAbsolute(fromArgs) ? fromArgs : path.join(process.cwd(), fromArgs);
  }
  const fromEnv = process.env.MINDFLOW_WORKSPACE;
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
  }
  return process.cwd();
}

function createMcpAgentProvider(args: Record<string, unknown>, workspaceRoot: string) {
  const provider = parseAgentProviderId(
    optionalString(args.provider) ||
      process.env.MINDFLOW_AGENT_PROVIDER ||
      process.env.MINDFLOW_PROVIDER ||
      "codex"
  );
  return createConfiguredAgentProvider(provider, {
    endpoint:
      optionalString(args.endpoint) ||
      process.env.MINDFLOW_AGENT_ENDPOINT ||
      process.env[`MINDFLOW_${provider.toUpperCase()}_ENDPOINT`] ||
      "",
    model:
      optionalString(args.model) ||
      process.env.MINDFLOW_AGENT_MODEL ||
      process.env[`MINDFLOW_${provider.toUpperCase()}_MODEL`] ||
      "",
    apiKey:
      optionalString(args.apiKey) ||
      process.env.MINDFLOW_AGENT_API_KEY ||
      process.env[`MINDFLOW_${provider.toUpperCase()}_API_KEY`],
    codexCliPath: optionalString(args.codexCliPath) || process.env.MINDFLOW_CODEX_CLI_PATH || "codex",
    workspaceRoot,
    debugDirectory: path.join(workspaceRoot, ".mindflow", "debug")
  });
}

function requireNode(flow: ProductFlow, nodeId: string | undefined): PageNode {
  const node = flow.nodes.find((item) => item.nodeId === nodeId);
  if (!node) {
    throw new Error(`Missing node: ${nodeId ?? ""}`);
  }
  return node;
}

function writeResult(id: JsonRpcId, result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id: JsonRpcId, code: number, message: string): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
}

function objectSchema(properties: Record<string, unknown>, description?: string | string[]): Record<string, unknown> {
  const required = Array.isArray(description) ? description : [];
  return {
    type: "object",
    description: Array.isArray(description) ? undefined : description,
    properties,
    required,
    additionalProperties: true
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return { type: "string", description };
}

function numberSchema(description: string): Record<string, unknown> {
  return { type: "number", description };
}

function arraySchema(description: string): Record<string, unknown> {
  return { type: "array", description };
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function nonEmptyArrayOr(value: string[] | undefined, fallback: string[] | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function requireRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
