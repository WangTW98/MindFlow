# Hierarchical PRD workflow

Workflow version 2 is the default for new canvas-producing tasks. Use this order without overlap:

1. Inventory every source and analyze the global product framework.
2. Complete and validate `analysis_packet.json` and `analysis_summary.md`.
3. Write `prd/product-prd.md`. It owns product positioning, scope, applications, roles, domains, information architecture, the complete page/state registry, cross-product journeys, permissions, constraints, acceptance direction, and unresolved decisions.
4. Freeze `prd/page-index.json`, then write one PRD for each indexed `page`, `popup`, or independent business state. Layouts, navigation, and shared components belong to the comprehensive PRD or their owning page unless they require independent canvas nodes.
5. Validate the complete bundle and export it one-way to `docs/mindflow/<task-id>/`. Never re-ingest that export in the same task.
6. Design and generate `graph/framework.md` only from the comprehensive PRD and page index.
7. Process `prd/pages/*.md` in index order, producing one matching `graph/pages/*.md`, enriching its existing canvas node, and creating its owned outgoing edges.
8. Run union-level draft validation and final canvas validation.

The page index is a closed scope contract. A page PRD may elaborate the comprehensive PRD using original evidence, but it must not silently add a page, role, application, or business flow. Additions require updating and revalidating the comprehensive PRD and page index first.

Each page PRD records purpose, users and permissions, entry and exit conditions, feature groups/items, data inputs/outputs, visible states and exceptions, outgoing navigation/data/status events, acceptance criteria, original evidence references, and unresolved decisions. The page owning the source feature outlet owns the edge; targets never duplicate it.

Framework graph drafts may use one temporary source-grounded feature group named `框架定义` with one item named `页面职责`. This is not the product model's default placeholder. Page enrichment must replace it, and final validation rejects it.
