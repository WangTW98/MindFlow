# MindFlow task contract

Each request creates `.mindflow/tasks/YYYYMMDD-HHmmss-short-slug/` unless the user explicitly names a task to resume. Required state includes `mindflow_task.md`, `source_inventory.md`, `requirement_ledger.md`, `analysis_summary.md`, `analysis_packet.json`, `graph/graph_summary.md`, `state/entity_index.md`, `state/generation_state.md`, `state/batch_plan.json`, `state/checkpoints.md`, `reports/semantic_validation.md`, and `reports/final_validation.md`.

New canvas tasks use `workflow_version: 3`, analysis-packet schema version 2, and page-index schema version 2. They additionally require `prd/product-prd.md`, `prd/page-index.json`, `prd/pages/`, `graph/framework.md`, `graph/pages/`, and `state/page_generation.json`. The PRD bundle and its one-way export must pass visual-composition, evidence, and page-specificity validation before framework design. The framework must be applied and verified before any page-enrichment batch. Workflow version 2 and legacy tasks remain readable and resumable without in-place migration.

Recovery order: main task, last checkpoint, generation state, live canvas revision/entities, relevant summary section, current partition. Never reload all historical partitions by default.

If a source changes, reset only dependent analysis to pending and graph drafts to stale. If the canvas changes, keep human content and coordinates, refresh the entity index, and rerun the current batch dry-run. Failed atomic batches are retried alone. A dry-run is valid only for its recorded revision. Guided mode requires approval before the first write, application milestones, and destructive batches.
