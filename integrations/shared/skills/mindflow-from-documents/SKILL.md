---
name: mindflow-from-documents
description: Analyze user-provided text, Markdown, PDF, Word, Excel, PowerPoint, images, attachments, or explicit URLs into partitioned MindFlow product evidence. Use when the source of a requested MindFlow canvas is documentation rather than an existing codebase.
---

# MindFlow From Documents

Use `mindflow-task-orchestrator` first. This skill analyzes sources; it never edits the canvas directly.

## Inventory and partition

1. Record each source with type, page/sheet/section/slide range, fingerprint, partition, and status.
2. Use the appropriate document reader for the format. Only browse URLs explicitly supplied by the user.
3. Build a global inventory of product scope, application forms, domains, roles, modules, and document sections before detailed analysis.
4. Partition by application, domain, route/page group, document chapter, large page, or complete business flow. Split again above 20,000 characters or 50 candidate nodes.

Do not assume a fixed number or kind of applications. A source may describe one application, several applications, or no separately modeled application surface. Existing canvas entities are reconciliation targets only and must never substitute for source analysis.

## Analyze a partition

Write scope and source evidence, product conclusions, root/app/generic-node candidates, independent state nodes, feature groups/items, business events, edge type with rationale, outlet strategy, inference confidence, unresolved items, and completion state.

For the root, synthesize two source-grounded narratives before graph design:

- `projectOverview.summary`: a PRD-level overview of the documented context, problem, product positioning, scope, key actors or collaboration, major workflows, and boundaries that are actually present in the source.
- `projectOverview.goal`: the documented objectives, intended outcomes, success or acceptance direction, and explicit exclusions that are actually present in the source.

For every discovered application surface, synthesize a PRD-level `appSurface.description` covering its positioning, intended users, responsibilities, important journeys or entry points, and permission/data boundary when the source provides them. Omit unsupported dimensions instead of inventing them. Never use a procurement-specific, four-application, or other fixed solution template.

Distinguish explicit evidence from inference. Record an inference as `origin: inferred`, with reason and confidence. Never reproduce full attachments or sensitive source content.

After every partition, checkpoint it. Only after all partitions are complete, synthesize the root narratives, application descriptions, duplicates, naming, cross-partition relations, status groups, data direction, edge types, and feature outlets in `analysis_summary.md`. Then hand off to `mindflow-canvas-authoring`.

Read [references/document-evidence.md](references/document-evidence.md) for evidence locator conventions.
