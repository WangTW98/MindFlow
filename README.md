# MindFlow Canvas Editor

MindFlow is a local VS Code editor for `.mindflow` ProductFlow JSON files. It provides a visual canvas, a sidebar for recent flows, and local editing tools for nodes, edges, app surfaces, domains, roles, and status groups.

## VS Code Surface

### Command Palette

| Command id | Command title | Purpose |
| --- | --- | --- |
| `mindflow.newFlow` | `MindFlow: New Blank Flow` | Create an untitled blank `.mindflow` ProductFlow and open it in the canvas editor. |
| `mindflow.openFlow` | `MindFlow: Open Product Flow` | Pick an existing `.mindflow` file and open it in the canvas editor. |
| `mindflow.saveFlowAs` | `MindFlow: Save Flow As...` | Save the current flow to a `.mindflow` file. |
| `mindflow.validateFlowJson` | `MindFlow: Validate Flow JSON` | Validate the active `.mindflow` file and show errors or warnings. |
| `mindflow.copyMcpConfig` | `MindFlow: Copy MCP Client Config` | Copy stdio MCP client config for external MCP clients to connect to the active VS Code editor. |

### Editor Commands

These commands are registered for the custom editor webview and are used by the local canvas UI.

| Command id | Purpose |
| --- | --- |
| `mindflow.updateNodePosition` | Persist a dragged node position. |
| `mindflow.updateAppSurfacePosition` | Persist a dragged app-surface position. |
| `mindflow.updateProjectOverviewPosition` | Persist the project overview position. |
| `mindflow.createNodeAt` | Create a page node at a canvas position. |
| `mindflow.updateNodeDetails` | Update a node's metadata, feature groups, roles, domains, and related details. |
| `mindflow.updateProjectOverview` | Update the local project overview title, summary, and goal. |
| `mindflow.createEdge` | Create an edge between two explicit flow endpoints. |
| `mindflow.createConnectedNodeAt` | Create a node and connect it from or to an existing endpoint. |
| `mindflow.removeNode` | Soft-remove a node and its active incident edges. |
| `mindflow.updateEdgeDetails` | Update an edge's trigger, condition, type, roles, domains, and endpoints. |
| `mindflow.removeEdge` | Soft-remove an edge. |
| `mindflow.updateTaxonomy` | Create, update, or delete app surfaces, domains, roles, and status groups. |

## File Format

MindFlow writes ProductFlow schema version `2.0`. The current format keeps local editor state only: project overview, app surfaces, domains, roles, status groups, nodes, edges, and canvas positions.

MindFlow accepts only the current `.mindflow` structure. Unsupported or obsolete fields are rejected and files are never migrated or rewritten automatically.

## MCP

When the extension is active, MindFlow starts a local MCP endpoint on `127.0.0.1` and exposes a stdio bridge for external MCP clients. Run `MindFlow: Copy MCP Client Config` in VS Code, then paste the copied config into your client.

MCP is an operation layer for the active MindFlow editor. It can read editor state, update selection state, edit root project details, app surfaces, taxonomy, nodes, edges, card positions, and batch node changes. MCP edits operate on the active MindFlow editor document through VS Code workspace edits. They do not write `.mindflow` files directly; use `Cmd+S` in VS Code to save the editor after reviewing changes.

## Development

```bash
npm install
npm run compile
npm test
```

Press F5 in VS Code to launch the extension host.

### Project Layout

- `src/product-flow/domain` contains the ProductFlow model, validation, serialization, and editing primitives.
- `src/product-flow/application/operations` contains the shared operation executor used by VS Code, MCP, and webview edits.
- `src/product-flow/infrastructure` contains local `.mindflow` persistence.
- `src/platform/vscode`, `src/platform/mcp`, and `src/platform/webview` contain platform adapters.
- `assets` contains packaged schema, icons, and webview styles. Generated JavaScript bundles are written to `out/`.

## Package

```bash
npm install
npm run package
code --install-extension mindflow-canvas-editor-0.1.0.vsix --force
```

Reload VS Code after installation, then run `MindFlow: New Blank Flow` or `MindFlow: Open Product Flow`.
