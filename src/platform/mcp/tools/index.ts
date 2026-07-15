import type { MindFlowEditorBridge } from "../protocol/bridge";
import { MINDFLOW_OPERATIONS_REFERENCE } from "../protocol/operationsReference";
import { MINDFLOW_MCP_TOOLS } from "../protocol/toolSchemas";
import { validateMcpToolInput } from "../protocol/toolInputValidation";
import { createBatchNodeToolActions } from "./batchNodeTools";
import { createEdgeToolActions } from "./edgeTools";
import { createEditorToolActions } from "./editorTools";
import { McpFlowEditRunner } from "./editRunner";
import { createNodeToolActions } from "./nodeTools";
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
    const invoke = this.toolRegistry.get(name);
    if (!invoke) {
      throw new Error(`Unknown MindFlow MCP tool: ${name}`);
    }
    const schemaName = TOOL_SCHEMA_ALIASES[name] ?? name;
    const definition = MINDFLOW_MCP_TOOLS.find((tool) => tool.name === schemaName);
    if (!definition) {
      throw new Error(`MindFlow MCP tool has no input schema: ${name}`);
    }
    const input = validateMcpToolInput(definition, args);
    return invoke(input);
  }

  public readOperationsReference(): string {
    return MINDFLOW_OPERATIONS_REFERENCE;
  }
}

const TOOL_SCHEMA_ALIASES: Readonly<Record<string, string>> = {
  mindflow_get_active_flow: "mindflow_get_editor_state",
  mindflow_get_open_flows: "mindflow_get_open_editors",
  mindflow_update_project: "mindflow_update_root",
  mindflow_upsert_node: "mindflow_upsert_page_node"
};
