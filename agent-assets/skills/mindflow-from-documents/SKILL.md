---
name: mindflow-from-documents
description: Analyze user-provided text, Markdown, PDF, Word, Excel, PowerPoint, images, attachments, or explicit URLs into partitioned MindFlow product evidence. Use when the source of a requested MindFlow canvas is documentation rather than an existing codebase.
---

# MindFlow From Documents

Use `mindflow-product-analysis` and `mindflow-task-orchestrator` first. This skill analyzes sources; it never edits the canvas directly.

## Inventory and partition

1. Record each source with type, page/sheet/section/slide range, fingerprint, partition, and status.
2. Use the appropriate document reader for the format. Only browse URLs explicitly supplied by the user.
3. Build a global inventory of product scope, application forms, domains, roles, modules, information architecture, and candidate page/state boundaries before detailed analysis.
4. Partition by application, domain, route/page group, document chapter, large page, or complete business flow. Split again above 20,000 characters or 50 candidate nodes.

Do not assume a fixed number or kind of applications. A source may describe one application, several applications, or no separately modeled application surface. Existing canvas entities are reconciliation targets only and must never substitute for source analysis.

Before synthesis, maintain a terminology map, requirement ledger, duplicate matrix, and conflict matrix across all documents. Preserve explicit priorities, exclusions, acceptance criteria, non-functional constraints, and unresolved stakeholder decisions.

## Analyze a partition

Write scope and source evidence, product conclusions, requirements and acceptance evidence, actors/ownership, journeys and alternatives, root/app/generic-node candidates, applicable independent states, ordered visual regions, concrete UI elements, business and data events, permissions, constraints, edge rationale, outlet strategy, inference confidence, conflicts, unresolved items, and completion state.

Preserve UI facts at source fidelity. Tables, lists, screenshots, and prose commonly name fields, columns, card contents, buttons, options, notices, placement, or order; retain those facts instead of reducing them to capability verbs. Model one feature as one visible UI block or interactive control and place its internal displayed fields in `contentSpec`. When the document defines only a capability, a conventional product structure may be inferred, but every inferred region or feature requires a reason and confidence and low-confidence or high-impact choices stay unresolved.

For the root, synthesize two source-grounded narratives before graph design:

- `projectOverview.summary`: a PRD-level overview of the documented context, problem, product positioning, scope, key actors or collaboration, major workflows, and boundaries that are actually present in the source.
- `projectOverview.goal`: the documented objectives, intended outcomes, success or acceptance direction, and explicit exclusions that are actually present in the source.

For every discovered application surface, synthesize a PRD-level `appSurface.description` covering its positioning, intended users, responsibilities, important journeys or entry points, and permission/data boundary when the source provides them. Omit unsupported dimensions instead of inventing them. Never use a procurement-specific, four-application, or other fixed solution template.

Distinguish explicit evidence from inference. Record an inference as `origin: inferred`, with reason and confidence. Never reproduce full attachments or sensitive source content.

After every partition, checkpoint it. Only after all partitions are complete, synthesize the root narratives, application descriptions, normalized terminology, requirements, conflicts, cross-partition relations, states, data direction, permissions, constraints, edge types, ordered regions, and feature outlets in `analysis_summary.md` and the shared `analysis_packet.json`. For workflow-version 2 or 3 canvas tasks, next write the comprehensive PRD, lock its page index, then write one PRD for each indexed page, popup, or independent business state. Version 3 page PRDs must preserve the normalized visual composition and original evidence locators. Do not draw before the complete PRD bundle validates and exports.

Read [references/document-evidence.md](references/document-evidence.md) for evidence locator conventions.
