function render() {
  const flow = state.flow;
  seedProjectOverviewPosition(flow);
  seedNodePositions(flow);
  seedAppSurfacePositions(flow);
  autoLayoutApplyPreviewState(flow);
  normalizeFilters();

  const activeNodes = flow.nodes.filter((node) => node.status !== "removed");
  const selectedNode = selectedNodeIds.length === 1
    ? activeNodes.find((node) => node.nodeId === selectedNodeIds[0]) || null
    : null;
  const selectedEdge = flow.edges.find((edge) => edge.edgeId === selectedEdgeId && edge.status === "active") || null;
  const selectedAppSurface = (flow.appSurfaces || []).find((surface) => surface.appId === selectedAppSurfaceId) || null;
  const selectedDomain = (flow.domains || []).find((domain) => domain.domainId === selectedDomainId) || null;
  const selectedRole = (flow.roles || []).find((role) => role.roleId === selectedRoleId) || null;
  const selectedStatusGroup = getStatusGroup(flow, selectedStatusGroupId);
  const visibleListNodes = activeNodes.filter((node) => matchesNodeSearch(flow, node, nodeSearch));
  const sidebarTitle = rootNodeTitle(flow);

  app.innerHTML = `
    <main class="app-shell ${leftPanelCollapsed ? "left-collapsed" : ""} ${selectedProjectOverview || selectedNode || selectedEdge || selectedAppSurface || selectedDomain || selectedRole || selectedStatusGroup ? "" : "inspector-collapsed"}">
      <aside class="left-panel">
        <section class="node-sidebar">
          <header class="nodes-toolbar">
            <div class="nodes-toolbar-title">
              <h2 class="nodes-root-title" title="${escapeAttr(sidebarTitle)}">${escapeHtml(sidebarTitle)}</h2>
            </div>
            <small class="nodes-count" aria-label="节点: ${activeNodes.length}">节点: ${activeNodes.length}</small>
          </header>
          <div class="node-search">
            <input id="nodeSearch" value="${escapeAttr(nodeSearch)}" placeholder="快速检索节点卡片">
          </div>
          <div class="node-list" aria-label="节点列表">
            ${visibleListNodes.map((node) => renderNodeListItem(flow, node)).join("") || "<p class=\"empty\">无匹配节点</p>"}
          </div>
        </section>
      </aside>

      <section class="canvas" id="canvas" tabindex="0">
        ${renderFloatingTaxonomyControls()}
        ${renderTaxonomyPanels(flow)}
        <svg class="edge-layer" id="edgeLayer"></svg>
        <div class="world" id="world">
          ${renderProjectOverviewCard(flow)}
          ${renderAppSurfaceSourceCards(flow)}
          ${activeNodes.map((node) => renderNodeCard(flow, node)).join("")}
        </div>
        ${renderSelectionRelationsPanel(flow, selectedNode, selectedEdge)}
        <div class="zoom-pill">${Math.round(zoom * 100)}%</div>
        ${renderCommandStatus()}
      </section>

      <aside class="inspector">
        ${selectedProjectOverview ? renderProjectOverviewInspector(flow) : selectedAppSurface ? renderAppSurfaceInspector(flow, selectedAppSurface) : selectedDomain ? renderDomainInspector(selectedDomain) : selectedRole ? renderRoleInspector(flow, selectedRole) : selectedStatusGroup ? renderStatusGroupInspector(selectedStatusGroup) : selectedEdge ? renderEdgeInspector(flow, selectedEdge) : selectedNode ? renderNodeInspector(flow, selectedNode) : ""}
      </aside>
    </main>
  `;

  bindEvents();
  restoreInspectorScroll();
  positionCards();
  initializeCanvasViewportForOpen(flow);
  applyCamera();
  persistUiState();
  scheduleDrawEdges();
}

function rootNodeTitle(flow) {
  return String(flow.title || "项目概述").trim() || "项目概述";
}

function refreshNodeSidebarHeader(flow) {
  const title = document.querySelector(".nodes-root-title");
  if (!title) {
    return;
  }
  const nextTitle = rootNodeTitle(flow);
  title.textContent = nextTitle;
  title.setAttribute("title", nextTitle);
}

function renderNodeListItem(flow, node) {
  const related = isNodeRelated(node);
  const pageType = getPageTypeOption(node.pageType);
  return `
    <button class="node-list-item ${isNodeSelected(node.nodeId) ? "selected" : ""} ${related ? "" : "dimmed"}"
      data-list-node-id="${escapeAttr(node.nodeId)}"
      aria-pressed="${isNodeSelected(node.nodeId) ? "true" : "false"}">
      <span class="node-list-icon" title="${escapeAttr(pageType.label)}" aria-hidden="true">${renderLucideIcon(pageType.icon)}</span>
      <span class="node-list-title">${escapeHtml(node.title)}</span>
    </button>
  `;
}

function matchesNodeSearch(flow, node, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const haystack = [
    node.title,
    node.pageType,
    node.purpose,
    namesByIds(flow.appSurfaces || [], "appId", node.appSurfaceIds || []),
    namesByIds(flow.domains, "domainId", node.domainIds || []),
    namesByIds(flow.roles, "roleId", node.roleIds || [])
  ].join(" ").toLowerCase();
  return haystack.includes(normalized);
}

function renderFilters(flow) {
  const appSurfaces = flow.appSurfaces || [];
  const domains = getAvailableDomains(flow);
  const roles = getAvailableRoles(flow);
  return `
    ${renderManagedList("appSurface", "应用端", appSurfaces, "appId", "name", "description", appFilters)}
    ${renderManagedList("domain", "业务域", domains, "domainId", "name", "description", domainFilters)}
    ${renderManagedList("role", "角色", roles, "roleId", "name", "description", roleFilters)}
    ${renderSaveHint()}
  `;
}

function renderCommandStatus() {
  if (!commandStatus) {
    return "";
  }
  return `
    <div class="command-status ${escapeAttr(commandStatus.kind)}" id="commandStatus" role="status">
      ${escapeHtml(commandStatus.message)}
    </div>
  `;
}

function renderSaveHint() {
  if (!commandStatus) {
    return "";
  }
  return `<p class="save-hint ${escapeAttr(commandStatus.kind)}" role="status">${escapeHtml(commandStatus.message)}</p>`;
}
