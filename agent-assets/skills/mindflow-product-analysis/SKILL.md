---
name: mindflow-product-analysis
description: Analyze one or more product documents, codebases, or existing MindFlow canvases into evidence-backed product models and orchestrate MindFlow creation/update, canvas audits, PRDs, interactive HTML, Figma, or Pencil design handoffs. Use for product requirement analysis, cross-source reconciliation, existing .mindflow understanding, workflow/status/navigation/permission audits, and controlled progressive canvas authoring.
---

# MindFlow Product Analysis

Use this skill as the entry point. MindFlow MCP supplies neutral canvas reads, writes, layout, and reveal operations; this skill owns interpretation and product methodology.

## Choose a mode

Set exactly one primary mode: `documents-to-canvas`, `code-to-canvas`, `canvas-to-canvas-update`, `canvas-audit`, or `canvas-to-deliverable`. Record secondary deliverables separately. Read [references/workflow-modes.md](references/workflow-modes.md) when choosing inputs and outputs.

## Build the analysis model

1. Use `mindflow-task-orchestrator` to create or resume task state.
2. Inventory every source and analyze the global product framework before page detail. Use `mindflow-from-documents`, `mindflow-from-code`, or `mindflow-from-canvas` according to source type; use several for mixed tasks.
3. Normalize evidence into `analysis_packet.json`. Workflow version 3 uses analysis-packet schema version 2 and preserves screens, ordered visual regions, concrete UI elements, explicit facts, inferred conclusions, conflicts, and unresolved questions separately.
4. Reconcile terminology, scope, applications, domains, roles, requirements, screens, regions, features, states, business/data flows, permissions, constraints, and acceptance evidence across all partitions.
5. For canvas creation or update, ensure the analysis packet contains root narratives, taxonomy, appSurfaces, and page index before proceeding to graph design.

Read [references/product-analysis-contract.md](references/product-analysis-contract.md) for the required analysis dimensions and evidence rules.
Read [references/hierarchical-prd-workflow.md](references/hierarchical-prd-workflow.md) for workflow-version 2 canvas tasks and hierarchical PRD deliverables.
Read [references/ui-composition-contract.md](references/ui-composition-contract.md) for workflow-version 3 screen, region, and UI-element semantics.

## Produce the requested result

- For workflow-version 2 or 3 canvas creation or update, hand the completed product PRD and page PRDs to `mindflow-canvas-authoring`; retain the approved analysis packet as evidence. Never send one full-canvas changeset.
- For an audit, apply [references/canvas-audit-checklists.md](references/canvas-audit-checklists.md) and report confirmed issues, probable gaps, suggestions, and unresolved questions with entity ids and confidence.
- For PRD or design output, build `deliverable_spec.json` and follow [references/deliverable-handoff.md](references/deliverable-handoff.md). Use the target environment's document, web, Figma, or Pencil capability; do not ask MindFlow MCP to generate the artifact.

Do not edit a canvas during read-only analysis. Ask for write authority when the requested result does not already imply canvas modification. Never silently convert uncertainty into nodes, edges, requirements, or design behavior.
