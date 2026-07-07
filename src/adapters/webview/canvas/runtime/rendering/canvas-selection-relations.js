function renderSelectionRelationsPanel(flow, selectedNode, selectedEdge) {
  const groups = getSelectionRelationGroups(flow, selectedNode, selectedEdge);
  if (!groups) {
    return "";
  }
  return `
    <aside class="selection-relations-panel" aria-label="选中关系">
      ${renderSelectionRelationGroup("From", groups.from, "无来源")}
      ${renderSelectionRelationGroup("To", groups.to, "无目标")}
    </aside>
  `;
}

function renderSelectionRelationGroup(label, items, emptyText) {
  return `
    <section class="selection-relations-group">
      <h3>${escapeHtml(label)}</h3>
      ${items.length > 0
        ? `<ul class="selection-relations-list">${items.map((item) => renderSelectionRelationItem(item)).join("")}</ul>`
        : `<p class="selection-relations-empty">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

function renderSelectionRelationItem(item) {
  return `
    <li>
      <button type="button"
        class="selection-relation-item"
        data-relation-card-kind="${escapeAttr(item.kind)}"
        data-relation-card-id="${escapeAttr(item.id)}"
        title="${escapeAttr(item.title)}">
        <span>${escapeHtml(item.title)}</span>
      </button>
    </li>
  `;
}

function getSelectionRelationGroups(flow, selectedNode, selectedEdge) {
  if (selectedEdge && selectedEdge.status === "active") {
    return getSelectionRelationsForEdge(flow, selectedEdge);
  }
  if (selectedNode && selectedNode.status !== "removed") {
    return getSelectionRelationsForNode(flow, selectedNode.nodeId);
  }
  return null;
}

function getSelectionRelationsForEdge(flow, edge) {
  return {
    from: uniqueSelectionRelationCards([
      relationCardFromEndpoint(flow, relationEndpointForEdge(edge, "from"))
    ]),
    to: uniqueSelectionRelationCards([
      relationCardFromEndpoint(flow, relationEndpointForEdge(edge, "to"))
    ])
  };
}

function getSelectionRelationsForNode(flow, nodeId) {
  const from = [];
  const to = [];
  const seenFrom = new Set();
  const seenTo = new Set();
  for (const edge of flow.edges || []) {
    if (edge.status !== "active") {
      continue;
    }
    const fromEndpoint = relationEndpointForEdge(edge, "from");
    const toEndpoint = relationEndpointForEdge(edge, "to");
    if (relationEndpointBelongsToNode(toEndpoint, nodeId)) {
      appendUniqueSelectionRelationCard(from, seenFrom, relationCardFromEndpoint(flow, fromEndpoint));
    }
    if (relationEndpointBelongsToNode(fromEndpoint, nodeId)) {
      appendUniqueSelectionRelationCard(to, seenTo, relationCardFromEndpoint(flow, toEndpoint));
    }
  }
  return { from, to };
}

function relationEndpointForEdge(edge, direction) {
  const endpoint = direction === "from" ? edge.from : edge.to;
  const fallbackNodeId = direction === "from" ? edge.fromNodeId : edge.toNodeId;
  return endpoint || { kind: "node", nodeId: fallbackNodeId || "" };
}

function relationEndpointBelongsToNode(endpoint, nodeId) {
  return Boolean(endpoint && endpoint.kind !== "projectOverview" && endpoint.kind !== "appSurface" && endpoint.nodeId === nodeId);
}

function relationCardFromEndpoint(flow, endpoint) {
  if (!endpoint) {
    return null;
  }
  if (endpoint.kind === "projectOverview") {
    return {
      kind: "projectOverview",
      id: PROJECT_OVERVIEW_NODE_ID,
      title: relationProjectOverviewTitle(flow)
    };
  }
  if (endpoint.kind === "appSurface") {
    const appId = relationEndpointEntityId(endpoint);
    const surface = (flow.appSurfaces || []).find((item) => item.appId === appId);
    if (!appId && !surface) {
      return null;
    }
    return {
      kind: "appSurface",
      id: appId,
      title: String(surface?.name || appId || "应用端卡片")
    };
  }
  const nodeId = endpoint.nodeId || "";
  const node = (flow.nodes || []).find((item) => item.nodeId === nodeId && item.status !== "removed");
  if (!node) {
    return null;
  }
  return {
    kind: "node",
    id: node.nodeId,
    title: String(node.title || node.nodeId)
  };
}

function uniqueSelectionRelationCards(cards) {
  const result = [];
  const seen = new Set();
  for (const card of cards) {
    appendUniqueSelectionRelationCard(result, seen, card);
  }
  return result;
}

function appendUniqueSelectionRelationCard(result, seen, card) {
  if (!card || !card.kind || !card.id) {
    return;
  }
  const key = `${card.kind}:${card.id}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  result.push(card);
}

function relationEndpointEntityId(endpoint) {
  if (endpoint.kind === "projectOverview") {
    return PROJECT_OVERVIEW_NODE_ID;
  }
  return endpoint.kind === "appSurface" ? endpoint.appId || endpoint.nodeId || "" : endpoint.nodeId || "";
}

function relationProjectOverviewTitle(flow) {
  return String(flow.title || "项目概述").trim() || "项目概述";
}

function bindSelectionRelations(root = document) {
  const panel = root.matches?.(".selection-relations-panel")
    ? root
    : root.querySelector?.(".selection-relations-panel");
  if (!panel) {
    return;
  }
  panel.querySelectorAll("[data-relation-card-kind][data-relation-card-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      centerCard(button.dataset.relationCardKind, button.dataset.relationCardId);
      focusCanvas();
    });
  });
}

function refreshSelectionRelationsPanel() {
  const canvas = document.getElementById("canvas");
  if (!canvas) {
    return;
  }
  const existing = canvas.querySelector(".selection-relations-panel");
  const activeNodes = state.flow.nodes.filter((node) => node.status !== "removed");
  const selectedNode = selectedNodeIds.length === 1
    ? activeNodes.find((node) => node.nodeId === selectedNodeIds[0]) || null
    : null;
  const selectedEdge = state.flow.edges.find((edge) => edge.edgeId === selectedEdgeId && edge.status === "active") || null;
  const html = renderSelectionRelationsPanel(state.flow, selectedNode, selectedEdge).trim();
  if (!html) {
    existing?.remove();
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const nextPanel = wrapper.firstElementChild;
  if (!nextPanel) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.replaceWith(nextPanel);
  } else {
    canvas.appendChild(nextPanel);
  }
  bindSelectionRelations(nextPanel);
}
