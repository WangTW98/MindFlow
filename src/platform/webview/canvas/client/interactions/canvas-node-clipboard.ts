const MINDFLOW_NODE_CLIPBOARD_KIND = "mindflow.nodes";
const MINDFLOW_NODE_CLIPBOARD_VERSION = 1;
let canvasClipboardPointer = null;

interface CanvasClipboardEntry {
  node: { nodeId: string };
  position: { x: number; y: number };
}

function trackCanvasClipboardPointer(event) {
  canvasClipboardPointer = {
    clientX: event.clientX,
    clientY: event.clientY
  };
}

function clearCanvasClipboardPointer() {
  canvasClipboardPointer = null;
}

function handleNodeClipboardShortcut(event) {
  if (isEditingTarget(event.target) || !isCanvasCommandModifier(event)) {
    return false;
  }
  const key = String(event.key || "").toLowerCase();
  if (key === "c") {
    event.preventDefault();
    event.stopPropagation();
    const payload = createSelectedNodeClipboardPayload();
    if (!payload) {
      setCommandStatus(false, "当前没有可复制的普通节点。");
      updateCommandStatusElement();
      return true;
    }
    postWebviewMessage({ type: "copyNodes", payload });
    return true;
  }
  if (key !== "v") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  const point = currentCanvasClipboardWorldPoint();
  if (!point) {
    setCommandStatus(false, "请将鼠标移入画布后再粘贴节点。");
    updateCommandStatusElement();
    return true;
  }
  postWebviewMessage({
    type: "pasteNodesAt",
    x: Math.round(point.x),
    y: Math.round(point.y)
  });
  return true;
}

function isCanvasCommandModifier(event) {
  return Boolean((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey);
}

function currentCanvasClipboardWorldPoint() {
  const canvas = document.getElementById("canvas");
  if (!canvas || !canvasClipboardPointer) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  if (
    canvasClipboardPointer.clientX < rect.left ||
    canvasClipboardPointer.clientX > rect.right ||
    canvasClipboardPointer.clientY < rect.top ||
    canvasClipboardPointer.clientY > rect.bottom
  ) {
    return null;
  }
  return screenToWorld(canvasClipboardPointer.clientX, canvasClipboardPointer.clientY);
}

function createSelectedNodeClipboardPayload() {
  const activeNodesById = new Map(
    state.flow.nodes
      .filter((node) => node.status !== "removed")
      .map((node) => [node.nodeId, node])
  );
  const entries = selectedNodeIds
    .map((nodeId) => ({ node: activeNodesById.get(nodeId), position: nodePositions.get(nodeId) }))
    .filter((entry): entry is CanvasClipboardEntry => Boolean(entry.node && entry.position));
  if (entries.length === 0) {
    return null;
  }
  const anchorX = Math.min(...entries.map((entry) => entry.position.x));
  const anchorY = Math.min(...entries.map((entry) => entry.position.y));
  const primaryIndex = Math.max(0, entries.findIndex((entry) => entry.node.nodeId === selectedNodeId));
  return {
    kind: MINDFLOW_NODE_CLIPBOARD_KIND,
    version: MINDFLOW_NODE_CLIPBOARD_VERSION,
    primaryIndex,
    nodes: entries.map(({ node, position }) => clipboardSnapshotForNode(node, position, anchorX, anchorY))
  };
}

function clipboardSnapshotForNode(node, position, anchorX, anchorY) {
  return {
    title: node.title,
    pageType: node.pageType,
    purpose: node.purpose,
    appSurfaceIds: [...(node.appSurfaceIds || [])],
    ...(node.statusGroupId ? { statusGroupId: node.statusGroupId } : {}),
    domainIds: [...(node.domainIds || [])],
    roleIds: [...(node.roleIds || [])],
    permissions: [...(node.permissions || [])],
    featureGroups: (node.featureGroups || []).map(clipboardFeatureGroup),
    offsetX: position.x - anchorX,
    offsetY: position.y - anchorY
  };
}

function clipboardFeatureGroup(group) {
  return {
    groupId: group.groupId,
    name: group.name,
    type: group.type,
    description: group.description,
    items: (group.items || []).map((item) => ({ ...item })),
    ...((group.actions || []).length > 0
      ? {
          actions: group.actions.map((action) => {
            const { targetNodeId: _targetNodeId, ...copy } = action;
            return copy;
          })
        }
      : {})
  };
}
