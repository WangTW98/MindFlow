---
name: mindflow-from-canvas
description: Read and reconstruct an existing MindFlow canvas through revision-aware MCP queries for product understanding, audits, canvas updates, PRDs, interactive HTML, Figma, or Pencil design handoffs. Use when a .mindflow file or open MindFlow editor is the source of truth or a reconciliation target, including workflow, status, navigation, role, permission, domain, and data-flow analysis.
---

# MindFlow From Canvas

Use `mindflow-product-analysis` and `mindflow-task-orchestrator`. This skill reads the canvas and produces evidence; it never edits unless the user's requested mode explicitly includes a canvas update.

## Read a consistent graph

1. Call `mindflow_get_editor_state` and record flow URI, flow id, revision, counts, schema, and capabilities.
2. For a small canvas, request the complete flow once. For a large canvas, page taxonomy and use `mindflow_get_subgraph` around root, applications, or scoped nodes with `expectedRevision`.
3. Use `mindflow_trace_paths` only for bounded path questions. Re-query if the revision changes; never combine pages from different revisions.
4. Record evidence as `mindflow:<flowId>@<revision>/<kind>/<id>`. Resolve feature outlets to owning nodes and retain edge ids.

## Reconstruct product meaning

Extract root positioning and goals, applications, domains, roles, screen hierarchy, features/actions, lifecycle states, business/data flows, permissions, constraints expressed in copy, and unresolved ambiguity. Existing canvas content is evidence of the modeled design, not proof that the design is complete or correct.

For audits, read [references/canvas-reading-contract.md](references/canvas-reading-contract.md), then apply the product-analysis audit checklist. Separate structural facts, semantic interpretation, probable gaps, and recommendations. For downstream deliverables, populate the shared analysis packet before generating a PRD or design specification.

Do not infer invisible UI details, API contracts, business rules, or missing states without a reason and confidence. Do not modify selection merely to read; use `mindflow_reveal_entities` only when a visible walkthrough helps the user.
