import type { FlowSelectionPatch } from "../../../product-flow/domain/selection";
import type { FlowOperation, FlowOperationResult } from "../../../product-flow/application/operations";
import { NODE_PAGE_TYPES, type NodePageType, type ProductFlow } from "../../../product-flow/domain";
import type { McpToolResult } from "./registry";

export const MCP_NODE_PAGE_TYPES = NODE_PAGE_TYPES;
export type McpNodePageType = NodePageType;

export interface IdMaps {
  nodes: Map<string, string>;
  appSurfaces: Map<string, string>;
  featureGroups?: Map<string, string>;
  featureItems?: Map<string, string>;
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
