# MindFlow follow-up notes

1. Add MCP layout inspection tools for card overlap, isolated nodes, long edge paths, and off-screen cards.
2. Add operation-level export tools for selected nodes or the full flow when a reviewed document export workflow is available.
3. Keep MCP as an editor operation layer: read editor state, update selection, and apply explicit root/app-surface/taxonomy/node/edge changes through VS Code workspace edits.
4. Keep file persistence under user control in VS Code; MCP must not write `.mindflow` files directly.
