---
name: mindflow-task-orchestrator
description: Create, validate, resume, and checkpoint partitioned MindFlow product-analysis tasks under .mindflow/tasks for documents, code, existing canvases, audits, canvas updates, PRDs, and design handoffs. Use whenever a non-trivial MindFlow workflow needs evidence traceability, bounded context, progressive generation, revision recovery, or resumable delivery.
---

# MindFlow Task Orchestrator

Use this skill after `mindflow-product-analysis` selects a mode and before source analysis or `mindflow-canvas-authoring`. MindFlow MCP is only the canvas operation layer; this skill owns analysis state and recovery.

## Start or resume

1. If the user gives a task id or explicitly asks to continue, inspect `.mindflow/tasks/<task-id>/mindflow_task.md`; otherwise create a new task.
2. For a new task run:

   ```bash
   python3 scripts/mindflow_task.py init --workspace <workspace> --title <title> --source-type <documents|code|canvas|mixed> --mode <mode> --source-root <path-or-url> [--output-target <canvas|audit|prd|html|figma|pencil>]
   ```

3. For recovery, read only `mindflow_task.md`, the latest checkpoint, `state/generation_state.md`, the relevant summary section, and the current partition.
4. Confirm current canvas revision and indexed entities before resuming generation. The canvas wins if it differs from `entity_index.md`.

## Enforce phases

New canvas tasks use workflow version 2 and this fixed order: `initializing`, `inventory`, `framework_analyzing`, `product_prd`, `page_prds`, `framework_designing`, `framework_generating`, `page_enriching`, `validating`, `delivering`, `completed`. Legacy tasks without `workflow_version` retain the original phase vocabulary. Do not enter framework design until every analysis partition, the comprehensive PRD, every indexed page PRD, and the one-way export are complete and valid.

Task status must be one of `pending`, `analyzing`, `designing`, `generating`, `validating`, `completed`, `blocked`. Canvas save status is separate: `not_created`, `dirty`, or `saved`.

After each analysis partition or generation batch, run `checkpoint` and set exactly one next action:

```bash
python3 scripts/mindflow_task.py checkpoint --task <task-dir> --phase <phase> --part <id> --next-action <one-action> [--flow-uri <uri>] [--revision-before N] [--revision-after N]
```

For every generation batch record its id/label, dry-run revision, applied revision, affected ids, reveal result, approval state, and next batch in `state/batch_plan.json`. Keep destructive batches separate.

## Keep context bounded

- One analysis partition: at most 20,000 characters and 50 candidate nodes.
- Main task file: at most 400 lines.
- Summaries link to details and do not repeat them.
- Inventory stores fingerprints and evidence locations, never complete sources, credentials, tokens, or sensitive configuration.
- On changed source fingerprint, invalidate only dependent partitions and graph drafts; list vanished entities as `staleCandidates` rather than deleting them.

Run `python3 scripts/mindflow_task.py validate --task <task-dir>` before a phase transition. Read [references/task-contract.md](references/task-contract.md) when implementing recovery, drift, or conflict handling.

For workflow-version 2, run `python3 scripts/mindflow_task.py export-prd --task <task-dir> --output <workspace>/docs/mindflow/<task-id>` after page PRDs validate. Generated exports are deliverables, never inputs to the same task.
