import { EDGE_TYPES } from "../models/productFlow";

export const MINDFLOW_OPERATIONS_REFERENCE_URI = "mindflow://operations-reference";

export const MINDFLOW_OPERATIONS_REFERENCE = `# MindFlow MCP Operations Reference

MindFlow MCP is an operation layer for the active VS Code MindFlow editor.
It reads editor state, updates canvas entities, updates selection state, and applies changes through VS Code workspace edits.

Persistence boundary:

- MCP tools never write .mindflow files directly.
- MCP tools update the active editor document only.
- The user reviews and saves the document in VS Code.

Editable entities:

- Root: the ProductFlow title, project overview summary, project goal, and root card position.
- App surfaces: appSurface records, including name, type, description, domainIds, roleIds, and card position.
- Taxonomy: domains, roles, and status groups.
- Nodes: ProductFlow PageNode cards.
- Edges: connections between projectOverview, appSurface, node, featureGroup, and featureItem endpoints.

Node page types:

- layout nodes use pageType "skeleton".
- navigation nodes use pageType "navigation".
- page nodes use pageType "page".
- popup nodes use pageType "popup".
- component nodes use pageType "component".

Selection state:

- selectedProjectOverview
- selectedNodeId
- selectedNodeIds
- selectedEdgeId
- selectedAppSurfaceId
- selectedDomainId
- selectedRoleId
- selectedStatusGroupId

MCP edge types mirror the ProductFlow runtime edge types:

${EDGE_TYPES.map((type) => `- ${type}`).join("\n")}

If an active edge already exists for the same exact endpoints, update it only when the type is the same.
Reject a different type for the same endpoints.
`;
