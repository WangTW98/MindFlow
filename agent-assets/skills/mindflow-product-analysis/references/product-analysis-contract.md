# Product analysis contract

Schema version 1 `analysis_packet.json` contains `sources`, `terminology`, `applications`, `domains`, `roles`, `requirements`, `screens`, `features`, `states`, `businessFlows`, `dataFlows`, `permissions`, `constraints`, `conflicts`, and `unresolved`.

Schema version 2 additionally requires `regions`. Screens own ordered region keys; regions own ordered feature keys; each feature is one visible UI block or interactive control rather than a page-level capability bucket. Read `ui-composition-contract.md` for the normalized contract.

Every substantive record needs `semanticKey`, `origin` (`explicit` or `inferred`), `evidenceRefs`, and `confidence` (`high`, `medium`, or `low`). An explicit record needs at least one evidence reference. An inferred record needs a reason. Use stable evidence locators: document plus page/section, code file plus symbol/line, or MindFlow flow id/revision plus entity id.

Analyze at least:

- product context, problem, positioning, scope, goals, exclusions, and acceptance direction;
- applications, users, responsibilities, entry points, permission/data boundaries;
- business domains, actors/roles, ownership, handoffs, and cross-domain dependencies;
- journeys, scenarios, preconditions, happy path, alternatives, failure/recovery, and terminal outcomes;
- screen/layout/navigation/page/popup/component inventory, ordered visual composition, visible content, controls, and feature/data bindings;
- lifecycle states and transitions without mechanically inventing generic states;
- permissions, sensitive data boundaries, integrations, constraints, non-functional requirements, and unresolved decisions;
- duplicate, contradictory, stale, or unsupported claims across sources.

Keep requirement ids traceable through candidate nodes, feature outlets, edges, PRD sections, and prototype interactions.
