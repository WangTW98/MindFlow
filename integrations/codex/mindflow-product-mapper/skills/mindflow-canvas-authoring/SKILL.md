---
name: mindflow-canvas-authoring
description: Convert a MindFlow product-analysis packet into graph drafts and progressively apply them through neutral MindFlow MCP operations. Use for graph design, semantic authoring policy, feature outlet selection, five-type edge classification, 2-batch progressive submission, canvas reveal, auto-layout, and final validation.
---

# MindFlow Canvas Authoring

Only use after `mindflow-product-analysis` and the task orchestrator record completed analysis and a valid analysis packet.

## Model nodes

- Create exactly one root and application-type nodes for application forms.
- Create every layout, nav, page, popup, component, and independent business state as a generic node using `mindflow_upsert_node` or a changeset `node.upsert`.
- Require `pageType`: layout=`skeleton`, nav=`navigation`, page=`page`, popup=`popup`, component=`component`.
- Give every new generic node explicit semantic feature groups and items. Never emit the default `基础功能 / 主要内容 / 确认按钮` placeholder.
- Preserve UI visual order: one region becomes one feature group and one UI block/control becomes one feature item. Put complex block fields or table columns in the item description/content specification (`contentSpec`).
- Treat a skeleton as a layout container: primary/side/tab/bottom `navigation` connects from parent navigation items; concrete layout regions (headers/footers/bars) use `component`.
- Give every generic node an explicit incoming edge in the completed draft.
- Name state nodes `Base title · State name`; nodes in a transition share `statusGroupId`.

## Classify edges

Evaluate in order:

1. containment -> `nestedRelation`
2. same status group transition -> `statusChange`
3. data read/write/transfer/sync -> `dataFlow`
4. view change: user -> `interaction`; system -> `autoNavigate`
5. user operation without navigation -> `interaction`

For each feature group/item outlet, `interaction`, `autoNavigate`, and `statusChange` share one target allowance. `nestedRelation` and `dataFlow` may fan out. Put submit, approve, reject, CRUD, conditions, and business meaning in `trigger`, `action`, and `condition`, not in edge type.

## Select the orange source outlet

For generic nodes use: feature item first; feature group only when the whole group triggers. Never use a generic node card as an MCP edge source, including for containment, automatic navigation, data flow, or status changes. Buttons, menus, tabs, links, fields, row/list operations, layout regions, and system events must use a feature outlet. The canvas renders root-to-application membership as a system line (never create a stored root-to-appSurface edge). An application card connects by `nestedRelation` to its unique skeleton.

## Progressive 2-Batch Generation Flow

Apply changes using 2 coherent batches:

1. **Batch 1 (Skeletons & Core Nodes)**: Create Root, Taxonomy (domains/roles/statusGroups), AppSurfaces, Skeletons, Pages, Popups, Components, and structural `nestedRelation` edges.
2. **Batch 2 (States & Edge Relations)**: Create State nodes, `interaction`, `autoNavigate`, `dataFlow`, and `statusChange` edges.

For each batch:
- Pin the current revision from `mindflow_get_editor_state`.
- Perform a dry-run via `mindflow_apply_canvas_changes` (dryRun: true) to confirm zero validation issues.
- Submit atomically, then call `mindflow_reveal_entities` for affected cards.
- Run `mindflow_preview_auto_layout` followed by `mindflow_apply_auto_layout` for visual positioning.
- Complete with `mindflow_validate_flow` for structural and semantic validation.

Read [references/authoring-contract.md](references/authoring-contract.md) for semantic keys and outlet endpoint shapes.
