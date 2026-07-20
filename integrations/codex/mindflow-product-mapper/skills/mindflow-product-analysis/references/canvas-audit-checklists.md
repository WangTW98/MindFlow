# Canvas audit checklists

Classify findings as `confirmedIssue`, `probableGap`, `suggestion`, or `unresolvedQuestion`. Include severity, confidence, evidence, and affected entity ids.

## Structure and reachability

- Trace reachability from the root and application entries.
- Find isolated, unreachable, duplicate-entry, dead-end, and unintended cycle candidates.
- Compare feature action targets with persisted edges.
- Verify cross-application handoffs have an explicit trigger and responsibility boundary.

## Flow and state

- Identify applicable initial, intermediate, terminal, cancel/reject/failure/timeout/recovery states.
- Detect unreachable states, states with no exit, contradictory conditions, and missing business outcomes.
- Do not require loading/empty/error/denied states when the product evidence does not make them applicable.

## Navigation and interaction

- Distinguish containment, user navigation, automatic navigation, data transfer, and state change.
- Check return/cancel/recovery routes, permission gates, and source feature outlets.
- Flag ambiguous transitions as questions rather than inventing intent.

## Roles, domains, permissions, and data

- Compare application-role, node-role, and operation-permission assignments.
- Identify responsibilities without owners and domains with inputs but no defined outcome.
- Trace data producers, consumers, writes, synchronization, and cross-domain ownership.
