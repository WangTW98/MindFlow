# MindFlow task contract

Each request creates `.mindflow/tasks/YYYYMMDD-HHmmss-short-slug/` unless the user explicitly names a task to resume. The authoritative state is Markdown. Required files are `mindflow_task.md`, `source_inventory.md`, `analysis_summary.md`, `graph/graph_summary.md`, `state/entity_index.md`, `state/generation_state.md`, `state/checkpoints.md`, `reports/semantic_validation.md`, and `reports/final_validation.md`.

Recovery order: main task, last checkpoint, generation state, live canvas revision/entities, relevant summary section, current partition. Never reload all historical partitions by default.

If a source changes, reset only dependent analysis to pending and graph drafts to stale. If the canvas changes, keep human content and coordinates, refresh the entity index, and rerun the current batch dry-run. Failed atomic batches are retried alone.

