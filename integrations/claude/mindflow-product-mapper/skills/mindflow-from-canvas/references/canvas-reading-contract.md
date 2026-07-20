# Canvas reading contract

Read in this order: editor metadata; root; applications and taxonomy; scoped node subgraphs; feature groups/items; relevant edges; removed entities only when history or stale-content analysis requires them.

Interpret endpoint ownership mechanically:

- projectOverview belongs to the root;
- appSurface belongs to the application card;
- node, featureGroup, and featureItem belong to the referenced generic node;
- edge type describes modeled effect, while trigger/action/condition carry business meaning.

Check revision on every paged or scoped read. If a canvas changes during analysis, invalidate only dependent partitions and record both revisions.

An audit finding records `classification`, `severity`, `confidence`, `evidenceRefs`, `affectedEntityIds`, `observation`, `reasoning`, and `recommendation`. Use `confirmedIssue` only when the graph proves the defect. Use `probableGap` for evidence-supported omissions and `unresolvedQuestion` when product intent is unavailable.
