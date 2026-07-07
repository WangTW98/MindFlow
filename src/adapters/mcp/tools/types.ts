import type { FlowSelectionPatch } from "../../../domain/product-flow/selection";
import type { FlowOperation, FlowOperationResult } from "../../../application/flow-operations";
import type { ProductFlow } from "../../../domain/product-flow";
import type { McpToolResult } from "./registry";

export const MCP_NODE_KINDS = ["layout", "navigation", "page", "popup", "component"] as const;
export type McpNodeKind = typeof MCP_NODE_KINDS[number];

export interface IdMaps {
  nodes: Map<string, string>;
  appSurfaces: Map<string, string>;
}

export interface BuiltMcpEdit {
  operations: FlowOperation[];
  atomic?: boolean;
  result?(results: FlowOperationResult[], flow: ProductFlow): McpToolResult;
  selection?(results: FlowOperationResult[]): FlowSelectionPatch | undefined;
}

export interface BatchEditResult {
  [key: string]: unknown;
  editor: Record<string, unknown>;
  applied: boolean;
  dryRun: boolean;
  issues: string[];
  result?: McpToolResult;
  flow?: ProductFlow;
}
