# Workflow modes

| Mode | Primary source | Result | Canvas writes |
| --- | --- | --- | --- |
| documents-to-canvas | documents/attachments/URLs | analyzed and drawn product map | progressive |
| code-to-canvas | source code | reverse-engineered product map | progressive |
| canvas-to-canvas-update | existing canvas plus evidence | reconciled canvas | progressive |
| canvas-audit | existing canvas | evidence-backed audit | none unless requested |
| canvas-to-deliverable | existing canvas | PRD or design handoff | none by default |

For mixed sources, keep one primary mode and list every source adapter. An existing canvas is reconciliation evidence, not proof that its product claims are correct. A downstream artifact is generated from the analysis packet, not directly from raw MCP payloads.

Use `guided` authoring by default: preview the batch plan, pause before the first write, at application milestones, and before deletion. Use `continuous` only after explicit authorization; still apply independent small batches and report each result.
