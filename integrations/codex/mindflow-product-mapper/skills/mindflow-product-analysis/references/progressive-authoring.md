# Progressive authoring

Server limits are safety ceilings, not batch targets. Default to at most 30 operations, 8 generic nodes, and 16 edges per batch.

Stage writes as: root narrative; taxonomy; application cards; one application skeleton and entry at a time; coherent business slices; states/data/cross-application relations; layout; reconciliation.

For every batch: pin the revision, attach `batchId` and `batchLabel`, dry-run, inspect `changeSummary`, apply the identical operations, call `mindflow_reveal_entities`, re-query changed ids at the returned revision, checkpoint, and announce the next batch. A batch is one undo unit. Never combine unrelated applications or destructive cleanup with constructive writes.

In `guided` mode pause before the first write, application milestones, and every destructive batch. In authorized `continuous` mode continue between small non-destructive batches while reporting progress. Revision drift invalidates the dry-run; re-read and reconcile instead of replaying stale operations.
