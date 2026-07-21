# MindFlow authoring contract

Semantic keys:

- application: type + normalized name
- taxonomy: kind + normalized name
- generic node: pageType + application + base title + status group + hierarchy
- feature group: owner node + name + type
- feature item: owner node + group + name + type
- edge: source endpoint + target endpoint + type + trigger/action

On one match preserve the id and coordinates. On no match create by localRef. On several matches write unresolved and do nothing. Missing-from-source entities are staleCandidates and are never automatically deleted.

Feature endpoints use node plus `groupId`/`itemId` (or changeset `groupRef`/`itemRef`). No MCP edge may originate from a generic node card; create a semantic layout, navigation, action, state, or system-event feature first. Root and application cards remain valid sources. An application has one app-card `nestedRelation` to its unique skeleton. Skeleton feature items may fan out to top-level navigation nodes and layout components. A child navigation has exactly one parent-navigation `interaction`; it is never duplicated as a skeleton navigation entry. Every completed MCP-authored generic node has an incoming edge. For one feature outlet, `interaction`, `autoNavigate`, and `statusChange` have at most one active target in total; `nestedRelation` and `dataFlow` may fan out. `statusChange` endpoints must own nodes with the same non-empty `statusGroupId`.

Root-to-application membership is rendered by the canvas as a system line for every app surface. Never store an edge from `root`/`projectOverview` to `appSurface`; it produces a duplicate visible line and a false edge count. Structural and semantic path reviews treat the system membership as the root-to-application step without expecting it in `flow.edges`.

Workflow-version 2 framework nodes may temporarily contain exactly one `框架定义 / 页面职责` feature item grounded in the comprehensive PRD. Page enrichment replaces it. Final drafts and completed canvases must contain neither that framework marker nor the default feature placeholder.

Root summary, root goal, and application descriptions come from completed source analysis. Existing canvas copy is never evidence. Their completeness is assessed by source coverage and substantive prose, not by domain-specific keywords or a fixed application count.
