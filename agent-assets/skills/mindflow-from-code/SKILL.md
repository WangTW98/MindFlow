---
name: mindflow-from-code
description: Reverse engineer an existing codebase into partitioned, evidence-backed MindFlow product structure without changing source code. Use when asked to derive applications, routes, layouts, navigation, pages, popups, components, actions, APIs, permissions, states, and business flows from code.
---

# MindFlow From Code

Use `mindflow-task-orchestrator` first. Code inspection is read-only; canvas generation waits for complete analysis and synthesis.

## Inventory

Identify repositories/packages, application entry points, application forms, routers, layouts, navigation, pages, popups, components, state stores, API clients, permissions, and lifecycle integration. Ignore dependency directories, build output, caches, coverage, vendored bundles, locks, minified assets, generated files, secrets, and environment values.

Prefer fast structural search (`rg`, file manifests, framework route conventions) before opening files. Fingerprint analyzed source locations and record evidence as file plus symbol or line span; never copy complete source files.

## Trace behavior

For each partition trace:

- route -> layout/nav -> page -> popup/component containment;
- menu, button, tab, link, field, form, table/list actions;
- handler -> state/store -> API -> response effect;
- permission/role gates;
- loading, empty, error, success, denied, and business states;
- page load, timer, push, callback, and automatic transitions.

Separate executable evidence from names/comments. Mark assumptions `origin: inferred` with reason and confidence. Use [references/code-evidence.md](references/code-evidence.md) for framework-neutral evidence rules.

## Partition and synthesize

Split by application, module, route group, large page/component tree, or complete business flow. Keep each partition below 20,000 characters and 50 candidate nodes. Checkpoint each completed partition. After every partition is complete, deduplicate semantic entities, reconcile cross-module behavior and unresolved items, and hand the synthesized result to `mindflow-canvas-authoring`.

