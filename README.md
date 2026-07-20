# MindFlow Canvas Editor

MindFlow is a local VS Code editor for `.mindflow` product mind maps. It creates, reads, edits, lays out, validates, and persists canvas entities. Product/document/code analysis belongs to external agents; MindFlow itself contains no AI analysis, document parser, code scanner, task orchestrator, or AI SDK.

## Canvas model

The current format is strict and has no compatibility or migration layer. Obsolete fields fail validation.

- One root node represents the product overview.
- Application-type nodes represent web, app, mini program, desktop, admin, or other application forms.
- One generic node model represents layout (`skeleton`), nav (`navigation`), page (`page`), popup (`popup`), and component (`component`).
- Loading, empty, error, success, denied, and other business states are independent generic nodes grouped with `statusGroupId`.
- Node version chains, replacement ids, hidden state arrays, and hidden exception arrays are not supported. ProductFlow `revision` is only optimistic concurrency control.

The only edge types are:

| Type | Meaning |
| --- | --- |
| `interaction` | User-triggered behavior or visible navigation |
| `autoNavigate` | System-triggered page/view navigation |
| `dataFlow` | Data read, write, transfer, or synchronization |
| `statusChange` | State transition inside one status group |
| `nestedRelation` | Structural containment |

Submit, approve, reject, and CRUD meaning belongs in `trigger`, `action`, and `condition`. For ordinary business edges, the source must be the relevant feature-item orange outlet, or a feature-group outlet if the action cannot be subdivided. Generic card outlets are reserved for structural containment and explicit system/whole-node lifecycle behavior.

## VS Code commands

| Command | Purpose |
| --- | --- |
| `MindFlow: New Blank Flow` | Open an untitled blank canvas |
| `MindFlow: Open Product Flow` | Open any local `.mindflow` file |
| `MindFlow: Save Flow As...` | Save the active canvas |
| `MindFlow: Validate Flow JSON` | Validate the active document |
| `MindFlow: Copy Global MCP Config` | Copy a global stdio MCP configuration to the clipboard |
| `MindFlow: Export Agent Skills` | Export the version-matched product-analysis Skills for an external Agent CLI |
| `MindFlow: Show MCP Connection Status` | Show the Router, runtime, host, and session diagnostics |

Canvas drag, detail, taxonomy, edge, and delete commands are internal custom-editor commands shared with the application operation layer.

## MCP canvas operations

The extension starts an authenticated loopback MCP session. MCP can:

- create/open/validate a flow;
- read compact editor state or explicitly request the full flow;
- page through root, application, taxonomy, node, feature, and edge entities;
- read revision-pinned local subgraphs and trace bounded directed paths;
- update/move root and application cards;
- create/update/move/remove generic nodes;
- duplicate nodes with the same semantics as manual paste;
- create connected nodes and edit the five edge types;
- preview/apply the DOM-measured canvas auto layout and reveal changed entities without changing selection;
- dry-run and atomically apply bounded revision-checked changesets using request-local references;
- return id maps, operation plans, validation issues, entity/type/outlet counts, and the resulting revision.

MCP edits the VS Code document through one atomic VS Code edit. It does not save the file; the user reviews and saves a dirty canvas.

## Global MCP registration

There is no client plugin or universal zero-configuration discovery. The extension starts authenticated loopback sessions and installs a global stdio Router at a stable per-user path:

- macOS/Linux: `~/.mindflow/mcp/runtime/mindflow-mcp-router.cjs`
- Windows: `%LOCALAPPDATA%/MindFlow/mcp/runtime/mindflow-mcp-router.cjs`

Register it once:

1. Install the MindFlow VSIX and start a local VS Code window. A workspace folder is optional.
2. Run `MindFlow: Copy Global MCP Config`.
3. Add the copied `mcpServers.mindflow` entry to the Agent's user/global MCP configuration.
4. Restart or refresh the Agent's MCP servers.
5. Call `mindflow_list_hosts`, then `mindflow_get_open_editors`.

The copied JSON contains only a verified runtime command and the stable Router path. It contains no project path, host id, port, or token. Codex users can translate the entry to `codex mcp add mindflow [--env KEY=VALUE] -- <command> <router-path>`. Claude Code users can add the inner server object with `claude mcp add-json` at `--scope user`; see the [official Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp).

The Router discovers live VS Code host records from `~/.mindflow/mcp/sessions/` (or `%LOCALAPPDATA%/MindFlow/mcp/sessions/` on Windows), validates heartbeat freshness, and routes each call dynamically. It works in empty VS Code windows and is not bound to a project or workspace. Use a precise `flowUri` whenever possible. With multiple hosts, read-only calls may use the most recently focused host, but every call that can change editor or window state requires an explicit `flowUri` or `hostId`. `mindflow_open_flow.flowPath` must be an absolute local `.mindflow` path. Remote SSH, WSL, Dev Container, and virtual-file-system paths are not supported.

MindFlow can open, edit, validate, and save local `.mindflow` files outside every open workspace. MCP access to an external file prompts for confirmation by default; `mindflow.security.externalFileAccess` can be set to `workspaceOnly` or `allow`. Real paths are checked so a workspace symlink cannot bypass the policy. The configured workspace `flowDirectory` remains only an optional default storage and initial-discovery location.

## Agent workflow and resumable tasks

The VSIX ships six standalone Agent Skills under `agent-assets/skills/`; run `MindFlow: Export Agent Skills` and install/copy them according to the target Agent CLI:

- `mindflow-product-analysis`
- `mindflow-task-orchestrator`
- `mindflow-canvas-authoring`
- `mindflow-from-documents`
- `mindflow-from-code`
- `mindflow-from-canvas`

Every new full analysis creates `.mindflow/tasks/YYYYMMDD-HHmmss-short-slug/`. The task uses a requirement ledger, portable analysis packet, bounded analysis/graph partitions, entity index, progressive batch plan, append-only checkpoints, and validation reports. Analysis follows inventory → detailed partitions → cross-partition synthesis → graph design → small dry-run/apply/reveal batches → final reconciliation or downstream deliverable handoff. Formal canvas generation is blocked until all analysis partitions and synthesis are complete.

Task state is local and ignored by Git by default. Initialize or validate it with:

```bash
python3 agent-assets/skills/mindflow-task-orchestrator/scripts/mindflow_task.py init \
  --workspace . --title "Order management" --source-type code --source-root src
python3 agent-assets/skills/mindflow-task-orchestrator/scripts/mindflow_task.py validate \
  --task .mindflow/tasks/<task-id>
```

## License

Copyright (c) 2026 MindFlow contributors.

MindFlow is licensed solely under the [GNU Affero General Public License Version 3](LICENSE.txt), represented by the SPDX identifier `AGPL-3.0-only`. The complete source code for this release is available from the [MindFlow repository](https://github.com/WangTW98/MindFlow). If you modify MindFlow and make the modified program available for users to interact with remotely over a network, review the corresponding-source obligations in section 13 of the license.

## Development

```bash
npm install
npm run compile
npm test
```

Press F5 to launch the Extension Host. Source boundaries:

- `src/product-flow/domain`: strict model, validation, serialization, editing primitives
- `src/product-flow/application/operations`: atomic operations shared by VS Code and MCP
- `src/product-flow/infrastructure`: local persistence
- `src/platform/vscode`, `src/platform/mcp`, `src/platform/webview`: platform adapters
- `agent-assets`: packaged standalone Skills, templates, schemas, and deterministic validators/export assets

To package the extension:

```bash
npm run package
code --install-extension mindflow-canvas-editor-0.1.0.vsix --force
```
