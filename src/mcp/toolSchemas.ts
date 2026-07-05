export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const objectSchema = {
  type: "object",
  additionalProperties: true
};

export const MINDFLOW_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "mindflow_get_active_flow",
    description: "Get the currently active MindFlow editor state, including flow data and selection.",
    inputSchema: { ...objectSchema, properties: { flowUri: { type: "string" } } }
  },
  {
    name: "mindflow_get_open_flows",
    description: "List all open MindFlow editor tabs and identify the active tab.",
    inputSchema: { ...objectSchema, additionalProperties: false, properties: {} }
  },
  {
    name: "mindflow_get_selection",
    description: "Get the current MindFlow canvas selection, including batch-selected nodes.",
    inputSchema: { ...objectSchema, properties: { flowUri: { type: "string" } } }
  },
  {
    name: "mindflow_update_project",
    description: "Update project name, summary, and goal in the active MindFlow editor.",
    inputSchema: { ...objectSchema }
  },
  {
    name: "mindflow_upsert_taxonomy",
    description: "Create or update app surfaces, business domains, roles, or status groups.",
    inputSchema: { ...objectSchema }
  },
  {
    name: "mindflow_upsert_node",
    description: "Create or update a MindFlow node card such as layout, navigation, page, popup, or component.",
    inputSchema: { ...objectSchema }
  },
  {
    name: "mindflow_upsert_edge",
    description: "Create or update a MindFlow edge with MCP-safe edge type and duplicate endpoint policy.",
    inputSchema: { ...objectSchema }
  },
  {
    name: "mindflow_remove_node",
    description: "Soft-remove a node from the active MindFlow editor.",
    inputSchema: { ...objectSchema }
  },
  {
    name: "mindflow_remove_edge",
    description: "Soft-remove an edge from the active MindFlow editor.",
    inputSchema: { ...objectSchema }
  },
  {
    name: "mindflow_apply_product_design",
    description: "Apply a product design into MindFlow using the hierarchy 项目概述 → 应用端 → 应用布局 → 导航 → 业务页面/弹窗 → 组件式内容元素.",
    inputSchema: { ...objectSchema }
  }
];
