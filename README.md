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
| `MindFlow: Open Product Flow` | Open a workspace `.mindflow` file |
| `MindFlow: Save Flow As...` | Save the active canvas |
| `MindFlow: Validate Flow JSON` | Validate the active document |

Canvas drag, detail, taxonomy, edge, and delete commands are internal custom-editor commands shared with the application operation layer.

## MCP canvas operations

The extension starts an authenticated loopback MCP session. MCP can:

- create/open/validate a flow;
- read compact editor state or explicitly request the full flow;
- page through root, application, taxonomy, node, feature, and edge entities;
- update/move root and application cards;
- create/update/move/remove generic nodes;
- create connected nodes and edit the five edge types;
- dry-run and atomically apply bounded revision-checked changesets using request-local references;
- return id maps, operation plans, validation issues, entity/type/outlet counts, and the resulting revision.

MCP edits the VS Code document through one workspace edit. It does not save the file; the user reviews and saves a dirty canvas.

## Zero-config agent discovery

The extension registers live sessions in:

- macOS/Linux: `~/.mindflow/mcp/sessions/`
- Windows: `%LOCALAPPDATA%/MindFlow/mcp/sessions/`

Each permission-restricted record includes the loopback endpoint, token, process, workspace roots, extension version, and timestamps. Stale process records are removed. The Codex and Claude plugin bootstrap selects the live session matching the agent working directory and proxies stdio MCP traffic. After installing the VS Code extension and the relevant plugin, no agent MCP configuration edit is required.

Repository plugin packages:

- `integrations/codex/mindflow-product-mapper`
- `integrations/claude/mindflow-product-mapper`

## Agent workflow and resumable tasks

Both plugins include four shared Skills:

- `mindflow-task-orchestrator`
- `mindflow-canvas-authoring`
- `mindflow-from-documents`
- `mindflow-from-code`

Every new full analysis creates `.mindflow/tasks/YYYYMMDD-HHmmss-short-slug/`. The task uses summary, bounded analysis partitions, graph partitions, an entity index, generation state, append-only checkpoints, and validation reports. Analysis follows inventory → detailed partitions → cross-partition synthesis → graph design → bounded dry-run/apply batches → final reconciliation. Formal canvas generation is blocked until all analysis partitions and synthesis are complete.

Task state is local and ignored by Git by default. Initialize or validate it with:

```bash
python3 integrations/shared/skills/mindflow-task-orchestrator/scripts/mindflow_task.py init \
  --workspace . --title "Order management" --source-type code --source-root src
python3 integrations/shared/skills/mindflow-task-orchestrator/scripts/mindflow_task.py validate \
  --task .mindflow/tasks/<task-id>
```

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
- `integrations/shared`: canonical Skills, templates, draft schema, and validators
- `integrations/codex`, `integrations/claude`: installable client plugins

To package the extension:

```bash
npm run package
code --install-extension mindflow-canvas-editor-0.1.0.vsix --force
```
