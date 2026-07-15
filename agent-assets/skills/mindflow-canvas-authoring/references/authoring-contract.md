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

Root summary, root goal, and application descriptions come from completed source analysis. Existing canvas copy is never evidence. Their completeness is assessed by source coverage and substantive prose, not by domain-specific keywords or a fixed application count.
