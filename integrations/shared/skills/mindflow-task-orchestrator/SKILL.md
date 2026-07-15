---
name: mindflow-task-orchestrator
description: Create, validate, resume, and checkpoint partitioned MindFlow product or code analysis tasks under .mindflow/tasks. Use whenever a request analyzes non-trivial documents or code before drawing a MindFlow canvas, continues an earlier MindFlow task, or needs context-safe phased generation.
---

# MindFlow Task Orchestrator

Use this skill before document/code analysis and before `mindflow-canvas-authoring`. MindFlow MCP is only the canvas operation layer; this skill owns analysis state and recovery.

## Start or resume

1. If the user gives a task id or explicitly asks to continue, inspect `.mindflow/tasks/<task-id>/mindflow_task.md`; otherwise create a new task.
2. For a new task run:

   ```bash
   python3 scripts/mindflow_task.py init --workspace <workspace> --title <title> --source-type <documents|code|mixed> --source-root <path-or-url>
   ```

3. For recovery, read only `mindflow_task.md`, the latest checkpoint, `state/generation_state.md`, the relevant summary section, and the current partition.
4. Confirm current canvas revision and indexed entities before resuming generation. The canvas wins if it differs from `entity_index.md`.

## Enforce phases

Use this fixed order: `initializing`, `inventory`, `analyzing`, `synthesizing`, `designing`, `generating`, `validating`. Do not formally generate until every planned analysis partition is complete and cross-partition synthesis is complete.

Task status must be one of `pending`, `analyzing`, `designing`, `generating`, `validating`, `completed`, `blocked`. Canvas save status is separate: `not_created`, `dirty`, or `saved`.

After each analysis partition or generation batch, run `checkpoint` and set exactly one next action:

```bash
python3 scripts/mindflow_task.py checkpoint --task <task-dir> --phase <phase> --part <id> --next-action <one-action> [--flow-uri <uri>] [--revision-before N] [--revision-after N]
```

## Keep context bounded

- One analysis partition: at most 20,000 characters and 50 candidate nodes.
- Main task file: at most 400 lines.
- Summaries link to details and do not repeat them.
- Inventory stores fingerprints and evidence locations, never complete sources, credentials, tokens, or sensitive configuration.
- On changed source fingerprint, invalidate only dependent partitions and graph drafts; list vanished entities as `staleCandidates` rather than deleting them.

Run `python3 scripts/mindflow_task.py validate --task <task-dir>` before a phase transition. Read [references/task-contract.md](references/task-contract.md) when implementing recovery, drift, or conflict handling.

