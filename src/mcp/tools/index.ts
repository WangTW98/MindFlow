import type { MindFlowEditorBridge } from "../bridge";
import { MINDFLOW_OPERATIONS_REFERENCE } from "../operationsReference";
import { MINDFLOW_MCP_TOOLS } from "../toolSchemas";
import { createBatchNodeToolActions } from "./batchNodeTools";
import { createEdgeToolActions } from "./edgeTools";
import { createEditorToolActions } from "./editorTools";
import { McpFlowEditRunner } from "./editRunner";
import { createNodeToolActions } from "./nodeTools";
import { asRecord } from "./readers";
import { createMcpToolRegistry, type McpToolActions, type McpToolInvoker, type McpToolResult } from "./registry";
import { createSelectionToolActions } from "./selectionTools";
import { createTaxonomyToolActions } from "./taxonomyTools";
export { MCP_NODE_KINDS, type McpNodeKind } from "./types";

export class MindFlowMcpToolHandlers {
  private readonly toolRegistry: ReadonlyMap<string, McpToolInvoker>;

  public constructor(private readonly bridge: MindFlowEditorBridge) {
    const runner = new McpFlowEditRunner(bridge);
    const actions: McpToolActions = {
      ...createEditorToolActions(bridge, runner),
      ...createSelectionToolActions(bridge),
      ...createTaxonomyToolActions(runner),
      ...createNodeToolActions(runner),
      ...createEdgeToolActions(runner),
      ...createBatchNodeToolActions(bridge, runner)
    };
    this.toolRegistry = createMcpToolRegistry(actions);
  }

  public listTools(): typeof MINDFLOW_MCP_TOOLS {
    return MINDFLOW_MCP_TOOLS;
  }

  public async callTool(name: string, args: unknown): Promise<McpToolResult> {
    const input = asRecord(args);
    const invoke = this.toolRegistry.get(name);
    if (!invoke) {
      throw new Error(`Unknown MindFlow MCP tool: ${name}`);
    }
    return invoke(input);
  }

  public readOperationsReference(): string {
    return MINDFLOW_OPERATIONS_REFERENCE;
  }
}
