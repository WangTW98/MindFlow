#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { PencilArtifact, PrdArtifact } from "../agents/AgentProvider";
import { createConfiguredAgentProvider, parseAgentProviderId } from "../agents/providerRuntime";
import {
  createManualEdge,
  createManualNode,
  removeManualEdge,
  updateManualEdgeDetails,
  updateManualNodeDetails
} from "../core/flowEditing";
import type { EdgeType, FeatureGroup, FlowEndpoint, PageNode, ProductFlow } from "../models/productFlow";
import { ArtifactRepository } from "../storage/artifactRepository";
import { FlowRepository } from "../storage/flowRepository";
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
  "Use MindFlow tools to inspect and update .mindflow ProductFlow JSON in the configured workspace.",
  "Call mindflow_list_flows before mindflow_read_flow when the user does not provide a flowPath.",
  "Prefer targeted node and edge tools over rewriting whole flow files, and write PRD/Pencil artifacts only when requested."
].join(" ");

const tools: ToolDefinition[] = [
  {
    name: "mindflow_analyze_document",
    description: "Analyze a requirements document into a .mindflow ProductFlow file in the MindFlow workspace.",
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
    name: "mindflow_create_edge",
    description: "Create a flow edge. The origin may be a node, feature group, or feature item; the target is a node.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      from: objectSchema({}, "FlowEndpoint origin."),
      toNodeId: stringSchema("Target node id."),
      trigger: stringSchema("Business trigger text shown on the edge."),
      type: stringSchema("Edge type.")
    }, ["from", "toNodeId"])
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
    name: "mindflow_write_prd",
    description: "Write a node or full PRD artifact and link it to the MindFlow ProductFlow file.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      scope: stringSchema("node or full."),
      nodeId: stringSchema("Required for node PRD."),
      markdown: stringSchema("PRD Markdown body. If omitted, the configured real provider generates a draft."),
      provider: stringSchema("AI provider used when markdown is omitted. Defaults to MINDFLOW_AGENT_PROVIDER or codex."),
      endpoint: stringSchema("Provider HTTP endpoint. Optional for codex when using Codex CLI."),
      model: stringSchema("Provider model name."),
      apiKey: stringSchema("Provider API key. Defaults to MINDFLOW_AGENT_API_KEY or provider-specific env vars."),
      codexCliPath: stringSchema("Codex CLI path. Defaults to MINDFLOW_CODEX_CLI_PATH or codex."),
      prdId: stringSchema("Optional stable PRD id.")
    })
  },
  {
    name: "mindflow_write_pencil",
    description: "Write a node or full Pencil design spec and link it to the MindFlow ProductFlow file.",
    inputSchema: objectSchema({
      workspaceRoot: stringSchema("Workspace root."),
      flowPath: stringSchema("MindFlow ProductFlow file path."),
      scope: stringSchema("node or full."),
      nodeId: stringSchema("Required for node Pencil spec."),
      spec: objectSchema({}, "Pencil spec object. If omitted, the configured real provider generates a draft."),
      provider: stringSchema("AI provider used when spec is omitted. Defaults to MINDFLOW_AGENT_PROVIDER or codex."),
      endpoint: stringSchema("Provider HTTP endpoint. Optional for codex when using Codex CLI."),
      model: stringSchema("Provider model name."),
      apiKey: stringSchema("Provider API key. Defaults to MINDFLOW_AGENT_API_KEY or provider-specific env vars."),
      codexCliPath: stringSchema("Codex CLI path. Defaults to MINDFLOW_CODEX_CLI_PATH or codex."),
      pencilId: stringSchema("Optional stable Pencil id.")
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
    case "mindflow_analyze_document":
      return analyzeDocument(args);
    case "mindflow_list_flows":
      return listFlows(args);
    case "mindflow_read_flow":
      return readFlow(args);
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
    case "mindflow_create_edge":
      return mutateFlow(args, (flow) => {
        const edge = createManualEdge(flow, {
          from: asRecord(args.from) as unknown as FlowEndpoint,
          toNodeId: requireString(args, "toNodeId"),
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
    case "mindflow_write_prd":
      return writePrd(args);
    case "mindflow_write_pencil":
      return writePencil(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function analyzeDocument(args: Record<string, unknown>): Promise<unknown> {
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
  return {
    workspaceRoot,
    flowPath: repository.relativePath(flowPath),
    flowId: flow.flowId,
    nodeCount: flow.nodes.length,
    edgeCount: flow.edges.length
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
  let artifact: PrdArtifact;
  if (typeof args.markdown === "string" && args.markdown.trim()) {
    artifact = {
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
      markdown: args.markdown
    };
  } else {
    const provider = createMcpAgentProvider(args, workspaceRoot);
    artifact = node ? await provider.generateNodePrd(flow, node) : await provider.generateFullPrd(flow);
    artifact.metadata.generatedBy = "mcp";
    artifact.metadata.linkedJsonPath = repository.relativePath(flowPath);
  }
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
  let artifact: PencilArtifact;
  if (isRecord(args.spec)) {
    artifact = {
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
      spec: args.spec
    };
  } else {
    const provider = createMcpAgentProvider(args, workspaceRoot);
    artifact = node ? await provider.generateNodePencil(flow, node) : await provider.generateFullPencil(flow);
    artifact.metadata.generatedBy = "mcp";
    artifact.metadata.linkedJsonPath = repository.relativePath(flowPath);
  }
  const written = await new ArtifactRepository(workspaceRoot).writePencil(flow, artifact);
  await repository.saveToPath(flowPath, flow);
  return {
    flowPath: repository.relativePath(flowPath),
    pencil: written.ref,
    path: written.relativePath
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
  const requestedPath = optionalString(args.flowPath);
  const flowPath = requestedPath
    ? path.isAbsolute(requestedPath) ? requestedPath : path.join(workspaceRoot, requestedPath)
    : await repository.latest();
  if (!flowPath) {
    throw new Error("No MindFlow ProductFlow file exists.");
  }
  const flow = await repository.load(flowPath);
  return { workspaceRoot, repository, flowPath, flow };
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

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
