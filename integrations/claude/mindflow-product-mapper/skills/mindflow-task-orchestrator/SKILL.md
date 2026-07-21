---
name: mindflow-task-orchestrator
description: Create, validate, resume, and checkpoint MindFlow product-analysis tasks. Use whenever a MindFlow workflow needs evidence traceability, progressive generation, or resumable delivery.
---

# MindFlow Task Orchestrator

Use this skill to orchestrate MindFlow canvas generation tasks. MCP handles canvas operations, while this skill manages analysis state and task progression.

## Consolidated 3-Stage Workflow

Tasks execute through 3 core logical stages:

1. `extraction`: Analyze input sources (documents, code, canvas) into a structured `ProductAnalysisPacket` containing root narratives, taxonomy (domains/roles/statusGroups), applications, and page index.
2. `draft_design`: Perform complete graph architecture and edge design in memory. Validate 5 edge types, orange feature outlets, and structural integrity using `mindflow_validate_flow`.
3. `applying`: Apply changes to the canvas in 2 coherent batches (`Batch 1: Skeletons & Core Nodes`, `Batch 2: States & Edge Relations`), then preview and apply auto layout.

## Start or Resume

1. If resuming a task, inspect `.mindflow/tasks/<task-id>/mindflow_task.md` or recent checkpoints; otherwise start a new task context.
2. Maintain task state cleanly in `.mindflow/tasks/<task-id>/`:
   - `mindflow_task.md`: Task status and execution log.
   - `analysis_packet.json`: Unified analysis output (root narratives, taxonomy, appSurfaces, page index).
3. Confirm current canvas revision (`mindflow_get_editor_state`) before submitting changesets.

## Keep Context Bounded

- Main task log: concise, at most 300 lines.
- Partition large inputs (>20,000 chars or >50 candidate nodes) during extraction.
- Avoid creating redundant intermediate page PRD files unless explicitly requested by the user.
