---
name: mindflow-from-documents
description: Analyze user-provided text, Markdown, PDF, Word, Excel, PowerPoint, images, attachments, or explicit URLs into partitioned MindFlow product evidence. Use when the source of a requested MindFlow canvas is documentation rather than an existing codebase.
---

# MindFlow From Documents

Use `mindflow-product-analysis` and `mindflow-task-orchestrator` first. This skill analyzes sources; it never edits the canvas directly.

## Inventory and partition

1. Record each source with type, section/slide/sheet range, and status. Only browse URLs explicitly supplied by the user.
2. Build a global inventory of product scope, application forms, domains, roles, modules, information architecture, and candidate page/state boundaries.
3. Partition large documents (>20,000 characters or >50 candidate nodes) by application, domain, chapter, or flow.
4. Do not assume a fixed number or kind of applications. Omit unsupported dimensions instead of inventing them. Never use a fixed solution template.

## Analyze and Synthesize

1. Preserve UI facts at source fidelity. Place internal displayed fields or table columns in `contentSpec` instead of reducing them to capability verbs.
2. For the root, synthesize two source-grounded narratives:
   - `projectOverview.summary`: PRD-level overview of context, problem, product positioning, scope, key actors, and workflows.
   - `projectOverview.goal`: documented objectives, intended outcomes, success direction, and explicit exclusions.
3. For every discovered application surface, synthesize a PRD-level `appSurface.description`.
4. Synthesize all partitions into a clean `analysis_packet.json` containing root narratives, taxonomy, appSurfaces, and page/popup index. Pass this packet directly to `mindflow-canvas-authoring`.

Read [references/document-evidence.md](references/document-evidence.md) for evidence locator conventions.
