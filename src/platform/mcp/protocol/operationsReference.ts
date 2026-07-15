import { EDGE_TYPES, NODE_PAGE_TYPES } from "../../../product-flow/domain";

export const MINDFLOW_OPERATIONS_REFERENCE_URI = "mindflow://operations-reference";
export const MINDFLOW_MODEL_REFERENCE_URI = "mindflow://current-model";
export const MINDFLOW_AUTHORING_REFERENCE_URI = "mindflow://authoring-rules";

export const MINDFLOW_SERVER_INSTRUCTIONS = "MindFlow only reads and edits product mind-map canvases; it does not analyze requirements or code. Use root, app-surface, and generic nodes. Source-analysis agents must derive detailed root summary, root goals, and application descriptions from evidence without assuming a domain or application count. Generic nodes require pageType and explicit semantic feature groups. Use only the five advertised edge types and never default uncertainty to interaction. Every generic-node edge must originate from a feature-item or feature-group outlet; only root and app-surface cards may be MCP edge sources. Model skeleton layout regions as top-level navigation nodes or component nodes such as top bars, search bars, headers, and footers; child navigation is entered only from its parent navigation item. External agents must partition large work in resumable mindflow_task Markdown state: query, dry-run a bounded changeset, apply it, checkpoint ids/revision, then validate. MindFlow never saves files; the user reviews and saves in VS Code.";

export const MINDFLOW_OPERATIONS_REFERENCE = `# MindFlow MCP Operations Reference

MindFlow MCP is an operation layer for an open VS Code MindFlow editor.

- It never analyzes documents, code, or product requirements.
- It never writes .mindflow files directly.
- The user reviews and saves the dirty editor document in VS Code.
- Large jobs use paged reads and bounded, resumable changesets.

Recommended workflow:

1. Create a new canvas or open an explicit workspace .mindflow file.
2. Query only the entity pages required for the current task partition.
3. Dry-run mindflow_apply_canvas_changes with the current revision.
4. Apply the same bounded changeset.
5. Record returned ids and revision in the agent task state.
6. Validate after all batches.
`;

export const MINDFLOW_MODEL_REFERENCE = `# Current MindFlow Model

Node classes:

- root: the one product overview.
- appSurface: an application type such as web, app, miniapp, desktop, or admin.
- node: the single generic canvas node model.

Generic node pageType values:

${NODE_PAGE_TYPES.map((type) => `- ${type}`).join("\n")}

There are no hidden node states or node version chains. Product states are separate generic nodes grouped by statusGroupId and connected with statusChange.

Edge types:

${EDGE_TYPES.map((type) => `- ${type}`).join("\n")}
`;

export const MINDFLOW_AUTHORING_REFERENCE = `# MindFlow Authoring Rules

Choose an edge type by business effect:

- nestedRelation: containment only.
- statusChange: a transition inside one status group.
- dataFlow: data read, write, transfer, or synchronization.
- interaction: a user-triggered action or visible navigation.
- autoNavigate: a system-triggered visible navigation.

Never invent an edge type and never use interaction as an uncertainty fallback.

For a generic node's outgoing edge, use the most specific orange outlet:

1. featureItem for a button, menu, tab, field, link, or row action.
2. featureGroup only when the entire group is the source.

Never use a generic node card as an MCP edge source, including for containment, automatic navigation, data flow, or state changes. Root and app-surface cards remain valid sources. An app-surface entry is a nestedRelation to its unique skeleton.

A skeleton is a layout container and may have several structural children. Its navigation entries represent only top-level primary, side, tab, or bottom navigation. Use component nodes for top bars, search bars, brand bars, headers, footers, and other concrete layout regions. A child navigation has exactly one parent: the parent navigation feature item through interaction, and is never repeated as a skeleton navigation entry. Every active generic node in a completed MCP-authored flow needs an active incoming edge.

Root summary, root goal, and application descriptions are source-analysis outputs. Write substantive PRD-level prose supported by the actual source, omit unsupported details, and never assume a domain-specific solution or a fixed number of applications. Existing canvas copy is not source evidence.

For each featureGroup or featureItem outlet, interaction, autoNavigate, and statusChange share one single-target allowance. nestedRelation and dataFlow may fan out. If one event has several navigational or state effects, split it into distinct semantic feature outlets.
`;
