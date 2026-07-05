export const MINDFLOW_AUTHORING_GUIDE_URI = "mindflow://authoring-guide";

export const MINDFLOW_AUTHORING_GUIDE = `# MindFlow Authoring Guide

Build MindFlow in this hierarchy:

1. 项目概述
2. 应用端
3. 应用布局
4. 导航
5. 业务页面/弹窗
6. 组件式内容元素

应用布局 is the parent layer of 导航. Do not model layout and navigation as siblings.

Editing rules:

- Never write .mindflow files directly. MCP edits must update the active VS Code editor document only; the user saves with Cmd+S.
- 应用端 are appSurfaces. They are rendered by the editor automatically and must not be duplicated as PageNode records.
- 应用布局 should usually be a node with pageType "skeleton".
- 导航 should usually be a node with pageType "navigation" and a nestedRelation edge from its 应用布局.
- 业务页面/弹窗 should connect from 导航.
- 组件式内容元素 are page content groupings, not code components. Prefer featureGroups/items on the page node. Create pageType "component" nodes only when a reusable or nested content structure must be shown independently.
- Create status groups only when the product design actually needs state modeling.
- MCP edge types are limited to interaction, autoNavigate, dataFlow, statusChange, nestedRelation. Choose one best type only.
- If an active edge already exists for the same exact endpoints, update it only when the type is the same. Reject a different type for the same endpoints.
`;
