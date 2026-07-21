---
name: mindflow-canvas-authoring
description: Convert a validated MindFlow product-analysis packet into graph drafts and progressively apply them through neutral MindFlow MCP operations. Use for graph design, semantic authoring policy, feature outlet selection, five-type edge classification, small revision-pinned batches, guided approvals, visible canvas reveal, drift reconciliation, and final structural plus semantic validation.
---

# MindFlow Canvas Authoring

Only use after `mindflow-product-analysis` and the task orchestrator record completed analysis, a valid analysis packet, and—under workflow version 2—a validated and exported comprehensive/page PRD bundle. Do not perform source analysis in this skill. Product methodology in this file is Skill policy, not an MCP server restriction.

## Model nodes

- Create exactly one root and application-type nodes for application forms.
- Create every layout, nav, page, popup, component, and independent business state as a generic node using `mindflow_upsert_node` or a changeset `node.upsert`.
- Require `pageType`: layout=`skeleton`, nav=`navigation`, page=`page`, popup=`popup`, component=`component`.
- Give every new generic node explicit semantic feature groups and items. Never emit the default `基础功能 / 主要内容 / 确认按钮` placeholder. A framework-stage stub may temporarily use exactly one source-grounded `框架定义 / 页面职责` item; final validation rejects any remaining framework stub.
- Treat a skeleton as a layout container with several possible children: each navigation feature may enter a top-level primary, side, tab, or bottom `navigation`; top bars, search bars, brand bars, headers, footers, and other concrete layout regions use `component`. A child navigation is reached only from its parent navigation item, never listed or connected from the skeleton as a second navigation entry.
- Give every generic node an explicit incoming edge in the completed draft. Initial state nodes enter from the real business event that creates or opens that state; never emit an orphan test node.
- Name state nodes `Base title · State name`; nodes in a transition share `statusGroupId`.
- Never emit `stableKey`, node version data, replacement ids, hidden states, or hidden exceptions.

## Classify edges

Evaluate in order:

1. containment -> `nestedRelation`
2. same status group transition -> `statusChange`
3. data read/write/transfer/sync -> `dataFlow`
4. view change: user -> `interaction`; system -> `autoNavigate`
5. user operation without navigation -> `interaction`
6. uncertainty -> record `unresolved`; do not draw

For each feature group/item outlet, `interaction`, `autoNavigate`, and `statusChange` share one target allowance. Split multiple navigational/state effects into distinct semantic outlets. `nestedRelation` and `dataFlow` may fan out. Put submit, approve, reject, CRUD, conditions, and business meaning in `trigger`, `action`, and `condition`, not in edge type.

## Select the orange source outlet

For generic nodes use: feature item first; feature group only when the whole group triggers. Never use a generic node card as an MCP edge source, including for containment, automatic navigation, data flow, or status changes. Buttons, menus, tabs, links, fields, row/list operations, layout regions, and system events must use a feature outlet. If the outlet is missing, create the group/item before the edge. The canvas renders root-to-application membership as a system line, so never create a stored root/projectOverview-to-appSurface edge. An application card connects by `nestedRelation` to its unique skeleton; query after skeleton creation and add the edge only when repair did not already create it.

## Generate safely

1. For workflow version 2, validate `graph/framework.md` with `--stage framework`, each page draft with `--stage page`, and the union with `--stage final --page-index <page-index.json>`. Legacy tasks may use the default final validation.
2. Query existing entities and preserve matched ids and all existing coordinates.
3. Generate the framework from the comprehensive PRD: root narratives, taxonomy, applications, skeletons, navigation/layout nodes, all indexed page/popup/state stubs, and only true structural `nestedRelation` edges. Do not emit root-to-application edges or page navigation/data/state edges at this stage.
4. Then process page PRDs in page-index order. Replace the owning stub with complete semantic content and emit each outgoing navigation, data, status, or automatic edge exactly once from that page's feature outlet. Build small coherent batches; default each batch to at most 30 operations, 8 nodes, and 16 edges.
5. Give every batch `batchId` and `batchLabel`. Query and pin the current revision, dry-run, inspect `changeSummary`, then submit the identical batch atomically.
6. Call `mindflow_reveal_entities` for affected cards, re-query changed ids at the returned revision, and checkpoint approval, dry-run, apply, reveal, ids, and next batch. On mismatch, reconcile before a new dry-run.
7. Use guided mode by default: pause before first write, application milestones, and destructive batches. Continue automatically only after explicit continuous authorization; never mix destructive cleanup into constructive batches.
8. Finish with structural `mindflow_validate_flow`, count reconciliation, and a Skill-owned semantic review. Use `mindflow_preview_auto_layout` then `mindflow_apply_auto_layout` as the final position stage. Mark the canvas `dirty` and tell the user to save.

Read `mindflow-product-analysis/references/progressive-authoring.md` when planning batches.

Read [references/authoring-contract.md](references/authoring-contract.md) for semantic keys and outlet endpoint shapes.
