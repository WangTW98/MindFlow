import { batchNodeToolEntries } from "./registry/batchNodes";
import { edgeToolEntries } from "./registry/edges";
import { editorToolEntries } from "./registry/editor";
import { nodeToolEntries } from "./registry/nodes";
import { taxonomyToolEntries } from "./registry/taxonomy";

export interface McpToolResult {
  [key: string]: unknown;
}

export type McpToolInput = Record<string, unknown>;
export type McpToolInvoker = (input: McpToolInput) => Promise<McpToolResult>;
export type McpToolEntry = readonly [string, McpToolInvoker];

export interface McpToolActions {
  createFlow(input: McpToolInput): Promise<McpToolResult>;
  openFlow(input: McpToolInput): Promise<McpToolResult>;
  validateFlow(input: McpToolInput): Promise<McpToolResult>;
  queryEntities(input: McpToolInput): Promise<McpToolResult>;
  applyCanvasChanges(input: McpToolInput): Promise<McpToolResult>;
  createConnectedNode(input: McpToolInput): Promise<McpToolResult>;
  getEditorState(input: McpToolInput): Promise<McpToolResult>;
  getOpenEditors(input: McpToolInput): Promise<McpToolResult>;
  getSelection(input: McpToolInput): Promise<McpToolResult>;
  setSelection(input: McpToolInput): Promise<McpToolResult>;
  clearSelection(input: McpToolInput): Promise<McpToolResult>;
  updateRoot(input: McpToolInput): Promise<McpToolResult>;
  moveRoot(input: McpToolInput): Promise<McpToolResult>;
  upsertAppSurface(input: McpToolInput): Promise<McpToolResult>;
  removeAppSurface(input: McpToolInput): Promise<McpToolResult>;
  moveAppSurface(input: McpToolInput): Promise<McpToolResult>;
  upsertDomain(input: McpToolInput): Promise<McpToolResult>;
  removeDomain(input: McpToolInput): Promise<McpToolResult>;
  upsertRole(input: McpToolInput): Promise<McpToolResult>;
  removeRole(input: McpToolInput): Promise<McpToolResult>;
  upsertStatusGroup(input: McpToolInput): Promise<McpToolResult>;
  removeStatusGroup(input: McpToolInput): Promise<McpToolResult>;
  upsertNode(input: McpToolInput): Promise<McpToolResult>;
  updateNode(input: McpToolInput): Promise<McpToolResult>;
  moveNode(input: McpToolInput): Promise<McpToolResult>;
  removeNode(input: McpToolInput): Promise<McpToolResult>;
  upsertEdge(input: McpToolInput): Promise<McpToolResult>;
  removeEdge(input: McpToolInput): Promise<McpToolResult>;
  batchGetNodes(input: McpToolInput): Promise<McpToolResult>;
  batchUpsertNodes(input: McpToolInput): Promise<McpToolResult>;
  batchUpdateNodes(input: McpToolInput): Promise<McpToolResult>;
  batchMoveNodes(input: McpToolInput): Promise<McpToolResult>;
  batchRemoveNodes(input: McpToolInput): Promise<McpToolResult>;
}

export function createMcpToolRegistry(actions: McpToolActions): ReadonlyMap<string, McpToolInvoker> {
  return new Map<string, McpToolInvoker>([
    ...editorToolEntries(actions),
    ...taxonomyToolEntries(actions),
    ...nodeToolEntries(actions),
    ...edgeToolEntries(actions),
    ...batchNodeToolEntries(actions)
  ]);
}

export function listMcpToolRegistryNames(): string[] {
  return Array.from(createMcpToolRegistry({} as McpToolActions).keys()).sort();
}
