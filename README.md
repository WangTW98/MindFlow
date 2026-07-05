# MindFlow Canvas Editor

MindFlow edits `.mindflow` ProductFlow JSON files in VS Code. The VS Code extension is a standalone visual editor with a sidebar for creating and reopening flows. AI-assisted document analysis, flow changes, PRD generation, Pencil spec generation, and artifact sync are exposed through the MindFlow MCP stdio server.

## VS Code Surface

### Command Palette

| Command id | Command title | Purpose |
| --- | --- | --- |
| `mindflow.newFlow` | `MindFlow: New Blank Flow` | Create an untitled blank `.mindflow` ProductFlow and open it in the canvas editor. |
| `mindflow.openFlow` | `MindFlow: Open Product Flow` | Pick an existing `.mindflow` file from the configured flow directory and open it in the canvas editor. |
| `mindflow.validateFlowJson` | `MindFlow: Validate Flow JSON` | Validate the active `.mindflow` file and show schema errors or warnings. |

### Editor-Internal Commands

These commands are registered for the MindFlow custom editor webview. They are not contributed as command-palette AI workflows.

| Command id | Purpose |
| --- | --- |
| `mindflow.updateNodePosition` | Persist a dragged node position. |
| `mindflow.updateAppSurfacePosition` | Persist a dragged app-surface position. |
| `mindflow.updateLayoutPositions` | Persist a batch of node and app-surface positions. |
| `mindflow.createNodeAt` | Create a page node at a canvas position. |
| `mindflow.updateNodeDetails` | Update a node's metadata, feature groups, roles, domains, and related details. |
| `mindflow.createEdge` | Create an edge between two explicit flow endpoints. |
| `mindflow.createConnectedNodeAt` | Create a node and connect it from or to an existing endpoint. |
| `mindflow.removeNode` | Soft-remove a node and its active incident edges. |
| `mindflow.updateEdgeDetails` | Update an edge's trigger, condition, type, roles, and domains. |
| `mindflow.removeEdge` | Soft-remove an edge. |
| `mindflow.updateTaxonomy` | Create, update, or delete app surfaces, domains, roles, and status groups. |

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `mindflow_list_flows` | List `.mindflow` files in the workspace flow directory. |
| `mindflow_read_flow` | Read the latest or specified ProductFlow file. |
| `mindflow_create_flow` | Create a blank ProductFlow file for manual or agent-driven editing. |
| `mindflow_generate_flow_from_document` | Use the configured AI provider to analyze requirements text or a document path into a ProductFlow file. |
| `mindflow_validate_flow` | Validate a ProductFlow file and return errors and warnings. |
| `mindflow_create_node` | Create a page node at a canvas position. |
| `mindflow_update_node` | Patch node details, feature groups, taxonomy assignments, and related metadata. |
| `mindflow_remove_node` | Soft-remove a node and active incident edges. |
| `mindflow_create_edge` | Create an edge from one explicit `FlowEndpoint` to another explicit `FlowEndpoint`. |
| `mindflow_update_edge` | Patch edge trigger text, condition, type, taxonomy assignments, and endpoint details. |
| `mindflow_remove_edge` | Soft-remove an edge. |
| `mindflow_create_connected_node` | Create a node and connect it from or to an explicit endpoint. |
| `mindflow_update_layout_positions` | Batch update node and app-surface canvas positions. |
| `mindflow_update_taxonomy` | Create, update, or delete app surfaces, domains, roles, and status groups. |
| `mindflow_propose_change` | Use the configured AI provider to convert an instruction into a validated `FlowChangePlan`. |
| `mindflow_apply_change_plan` | Apply a `FlowChangePlan`, increment revision, and write change history. |
| `mindflow_revert_change_set` | Revert the latest applied change set from flow history. |
| `mindflow_write_prd` | Write provided PRD Markdown and link it to the ProductFlow. |
| `mindflow_generate_prd` | Use the configured AI provider to generate and write node-level or full-flow PRD Markdown. |
| `mindflow_write_pencil` | Write a provided Pencil design spec object and link it to the ProductFlow. |
| `mindflow_generate_pencil` | Use the configured AI provider to generate and write node-level or full-flow Pencil design specs. |
| `mindflow_sync_artifacts` | Inspect linked PRD/Pencil artifacts, update artifact status, and write a sync report. |

## Development

```bash
npm install
npm run compile
npm test
```

Press F5 in VS Code to launch the extension host.

## Install in VS Code

```bash
npm install
npm run compile
npx vsce package
code --install-extension mindflow-canvas-editor-0.1.0.vsix --force
```

Reload VS Code after installation, then run `MindFlow: New Blank Flow` or `MindFlow: Open Product Flow`.

## MCP Server

MindFlow ships a local MCP stdio server named `mindflow`. MCP clients load servers from their own MCP config. Register MindFlow with installed local agents with:

```bash
npm run mcp:install
```

The installer compiles the extension and registers the stable launcher `scripts/mindflow-mcp.mjs` with local clients it finds:

| Client | Registration path |
| --- | --- |
| Codex CLI | `codex mcp add mindflow ...` |
| Gemini CLI | `gemini mcp add -s user mindflow ...` |
| Claude Code | `claude mcp add --scope user mindflow ...` |

Register one client:

```bash
node scripts/install-mcp.mjs --client codex
```

Write project-scoped config files instead of user-level CLI config:

```bash
npm run mcp:install:project
```

Verify the MCP protocol and local write tools:

```bash
npm run mcp:verify
```

For manual MCP client configuration, use command `node`, args `["/Users/wang/Documents/MindFlow/scripts/mindflow-mcp.mjs"]`, and set `MINDFLOW_WORKSPACE=/Users/wang/Documents/MindFlow`.

AI-backed MCP tools use real providers only. Configure them with:

| Variable | Purpose |
| --- | --- |
| `MINDFLOW_AGENT_PROVIDER=codex\|gemini` | Provider selection. Defaults to `codex`. |
| `MINDFLOW_AGENT_ENDPOINT` | HTTP endpoint for HTTP providers. Omit for Codex CLI. |
| `MINDFLOW_AGENT_MODEL` | Provider model name. |
| `MINDFLOW_AGENT_API_KEY` | Provider API key. |
| `MINDFLOW_CODEX_CLI_PATH` | Codex CLI path. Defaults to `codex`. |

## Synchronization Model

The `.mindflow` file is the structural source of truth. PRD files contain frontmatter with `flowId`, `nodeId` or `scope=full`, `prdId`, `linkedPencilIds`, and `linkedJsonPath`. Pencil design specs contain metadata with `flowId`, `nodeId` or `scope=full`, `pencilId`, `linkedPrdIds`, and `linkedJsonPath`.

Natural-language flow edits are applied through MCP as structured `FlowChangePlan` objects. Plans are validated, applied deterministically, written to `changeHistory`, and can mark affected PRD/Pencil artifacts as stale.
