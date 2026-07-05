# MindFlow Product Flow Agent

MindFlow is a VSCode extension MVP that turns product or business documents into editable `.mindflow` ProductFlow files. A `.mindflow` file is still JSON internally, but opens in the MindFlow visual editor by default.

## Capabilities

- Analyze Markdown, text, or the active editor into `.mindflow/flows/*.mindflow`.
- Select `.docx` files as input; for best fidelity convert them to Markdown or TXT before analysis in this MVP.
- Open `.mindflow` files from VSCode Explorer in the current editor tab with a fixed three-panel custom editor: left node list, infinite canvas, draggable page cards, editable right-side details, app-surface filters, business-domain filters, and role filters.
- Right-click blank canvas space to create a page card; connect cards manually from a card, feature group, or feature item to a target card.
- Use the MindFlow Activity Bar icon to create a MindFlow, reopen historical `.mindflow` files, and inspect local AI CLI availability for Codex, Gemini, and Claude.
- Edit feature groups and feature items as nested cards in the right inspector, including drag-moving items between groups.
- Apply visual flow edits through VSCode document edits so File > Save and Edit > Undo/Redo work on the same `.mindflow` editor tab without opening a synchronized JSON editor tab.
- Modify the flow with natural language through structured `FlowChangePlan` / `ChangeSet` previews.
- Generate node-level or full-flow PRD Markdown files under `docs/prd/{flowId}`.
- Generate node-level or full-flow Pencil design spec JSON files under `designs/pencil/{flowId}`.
- Keep `.mindflow` nodes, PRDs, and Pencil specs linked through stable IDs and sync reports.
- Expose an MCP stdio server so external AI agents can read and mutate `.mindflow` ProductFlow JSON and write PRD/Pencil artifacts without using visual inputs inside the Webview.

## Commands

- `MindFlow: Analyze Document`
- `MindFlow: Open Product Flow`
- `MindFlow: Modify Product Flow by Instruction`
- `MindFlow: Preview ChangeSet`
- `MindFlow: Apply ChangeSet`
- `MindFlow: Revert Last ChangeSet`
- `MindFlow: Validate Flow JSON`
- `MindFlow: Generate Node PRD`
- `MindFlow: Generate Full PRD`
- `MindFlow: Refresh Stale PRD`
- `MindFlow: Generate Node Pencil Design`
- `MindFlow: Generate Full Pencil Design`
- `MindFlow: Refresh Stale Pencil Design`
- `MindFlow: Sync PRD/Pencil/JSON Artifacts`
- `MindFlow: Configure AI Agent`

## AI Providers

Set `mindflow.agent.provider` to `mock`, `codex`, or `gemini`.

The `mock` provider works without credentials and is the default. The `codex` and `gemini` providers use configurable HTTP endpoints and store API keys through VSCode `SecretStorage`; no API key is written to the repository.

## Development

```bash
npm install
npm run compile
npm test
```

Press F5 in VSCode to launch the extension host.

## Install in VSCode

```bash
npm install
npm run compile
npx vsce package
code --install-extension mindflow-product-flow-agent-0.1.0.vsix --force
```

Reload VSCode after installation, then run `MindFlow: Analyze Document` or `MindFlow: Open Product Flow`.

## MCP Server

MindFlow ships a local MCP stdio server named `mindflow`. MCP clients do not scan arbitrary local projects automatically; they load servers from their own MCP config. Register MindFlow with installed local agents with:

```bash
npm run mcp:install
```

The installer compiles the extension and registers the stable launcher `scripts/mindflow-mcp.mjs` with the local clients it finds:

- Codex CLI: `codex mcp add mindflow ...`, visible in `codex mcp list` and the Codex TUI `/mcp` panel.
- Gemini CLI: `gemini mcp add -s user mindflow ...`, visible in `gemini mcp list` and `/mcp`.
- Claude Code: `claude mcp add --scope user mindflow ...`, visible in `claude mcp list` and `/mcp`.

Register only one client:

```bash
node scripts/install-mcp.mjs --client codex
```

Write project-scoped config files instead of user-level CLI config:

```bash
npm run mcp:install:project
```

Verify the server protocol directly:

```bash
npm run mcp:verify
```

For manual MCP client configuration, use command `node`, args `["/Users/wang/Documents/MindFlow/scripts/mindflow-mcp.mjs"]`, and set `MINDFLOW_WORKSPACE=/Users/wang/Documents/MindFlow`.

Available MCP tools:

- `mindflow_list_flows`
- `mindflow_analyze_document`
- `mindflow_read_flow`
- `mindflow_create_node`
- `mindflow_update_node`
- `mindflow_create_edge`
- `mindflow_update_edge`
- `mindflow_remove_edge`
- `mindflow_write_prd`
- `mindflow_write_pencil`

## Synchronization Model

The `.mindflow` file is the source of structural truth and contains ProductFlow JSON. PRD files contain YAML frontmatter with `flowId`, `nodeId` or `scope=full`, `prdId`, `linkedPencilIds`, and `linkedJsonPath`. Pencil design specs contain metadata with `flowId`, `nodeId` or `scope=full`, `pencilId`, `linkedPrdIds`, and `linkedJsonPath`.

Natural-language flow edits are never applied by replacing the full JSON. Providers return a `FlowChangePlan`; the extension previews it, validates it, applies it deterministically, increments `revision`, writes `changeHistory`, and marks affected PRD/Pencil artifacts as `stale`.
