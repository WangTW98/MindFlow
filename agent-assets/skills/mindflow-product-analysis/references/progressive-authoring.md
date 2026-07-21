# Progressive authoring

Server limits are safety ceilings, not batch targets. Default to at most 30 operations, 8 generic nodes, and 16 edges per batch.

For workflow version 2, stage writes as: comprehensive-PRD framework (root, taxonomy, applications, skeleton/navigation, all indexed stubs, true containment); page-PRD enrichment in index order; cross-page reconciliation; states/data/cross-application relations; layout. Root-to-application membership is a rendered system line and is never a stored edge.

For every batch: pin the revision, attach `batchId` and `batchLabel`, dry-run, inspect `changeSummary`, apply the identical operations, call `mindflow_reveal_entities`, re-query changed ids at the returned revision, checkpoint, and announce the next batch. A batch is one undo unit. Never combine unrelated applications or destructive cleanup with constructive writes.

In `guided` mode pause before the first write, application milestones, and every destructive batch. In authorized `continuous` mode continue between small non-destructive batches while reporting progress. Revision drift invalidates the dry-run; re-read and reconcile instead of replaying stale operations.
