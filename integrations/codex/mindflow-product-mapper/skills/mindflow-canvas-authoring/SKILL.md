---
name: mindflow-canvas-authoring
description: Convert completed MindFlow task analysis into valid graph drafts and apply them through MindFlow MCP. Use for graph design, generic-node creation, feature outlet selection, five-type edge classification, dry-runs, bounded changesets, drift reconciliation, and final canvas validation.
---

# MindFlow Canvas Authoring

Only use after the task orchestrator records completed analysis and synthesis. Do not perform product or code analysis in this skill.

## Model nodes

- Create exactly one root and application-type nodes for application forms.
- Create every layout, nav, page, popup, component, and independent business state as a generic node using `mindflow_upsert_node` or a changeset `node.upsert`.
- Require `pageType`: layout=`skeleton`, nav=`navigation`, page=`page`, popup=`popup`, component=`component`.
- Give every new generic node explicit semantic feature groups and items. Never emit the default `基础功能 / 主要内容 / 确认按钮` placeholder.
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

For generic nodes use: feature item first; feature group only when the whole group triggers. Never use a generic node card as an MCP edge source, including for containment, automatic navigation, data flow, or status changes. Buttons, menus, tabs, links, fields, row/list operations, layout regions, and system events must use a feature outlet. If the outlet is missing, create the group/item before the edge. Root and application nodes may use their card outlet; an application card connects by `nestedRelation` to its unique skeleton.

## Generate safely

1. Validate fenced JSON graph drafts with `python3 scripts/validate_mindflow_draft.py <graph-files...>`.
2. Query existing entities and preserve matched ids and all existing coordinates.
3. Generate in order: source-grounded root narratives, taxonomy, source-discovered apps and their descriptions, skeletons, top-level navigation/layout components, child navigation, pages, business components/popups, states, features, then `nestedRelation`, `interaction`, `dataFlow`, `statusChange`, `autoNavigate`.
4. Limit a batch to 40 generic nodes and 80 edges; keep a feature group with its items.
5. Query current revision, dry-run with the required revision, inspect counts/types/outlets, then submit the same batch atomically.
6. Record returned ids, revision, and a checkpoint. On mismatch, re-query and semantically reconcile before a new dry-run.
7. Finish with `mindflow_validate_flow` plus paginated count reconciliation. Mark the canvas `dirty` and tell the user to save.

Read [references/authoring-contract.md](references/authoring-contract.md) for semantic keys and outlet endpoint shapes.
