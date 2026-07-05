function render() {
  const flow = state.flow;
  seedProjectOverviewPosition(flow);
  seedNodePositions(flow);
  seedAppSurfacePositions(flow);
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

  app.innerHTML = `
    <main class="app-shell ${leftPanelCollapsed ? "left-collapsed" : ""} ${selectedProjectOverview || selectedNode || selectedEdge || selectedAppSurface || selectedDomain || selectedRole || selectedStatusGroup ? "" : "inspector-collapsed"}">
      <aside class="left-panel">
        <section class="node-sidebar">
          <header class="nodes-toolbar">
            <div class="nodes-toolbar-title">
              <h2>节点</h2>
              <small class="nodes-count" aria-label="节点总数">${activeNodes.length}</small>
            </div>
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
  applyCamera();
  persistUiState();
  scheduleDrawEdges();
}

function renderProjectOverviewCard(flow) {
  const overview = getProjectOverview(flow);
  const summary = overview.summary || "暂无项目综述";
  const goal = overview.goal || "暂无项目目标";
  return `
    <article class="project-overview-card ${selectedProjectOverview ? "selected" : ""}"
      data-project-overview-id="${escapeAttr(PROJECT_OVERVIEW_NODE_ID)}">
      <header class="project-overview-head">
        <div class="project-overview-title">
          <span class="project-overview-icon" aria-hidden="true">${renderLucideIcon("file-text")}</span>
          <div>
            <h3>${escapeHtml(flow.title || "项目概述")}</h3>
            <small>项目概述</small>
          </div>
        </div>
      </header>
      <section class="project-overview-copy">
        <div>
          <strong>项目综述</strong>
          <p>${escapeHtml(summary)}</p>
        </div>
        <div>
          <strong>项目目标</strong>
          <p>${escapeHtml(goal)}</p>
        </div>
      </section>
      <div class="project-overview-taxonomy">
        ${renderProjectOverviewCardSection("appSurface", "应用端", "monitor-smartphone", flow.appSurfaces || [], "appId", "name", "description")}
        ${renderProjectOverviewCardSection("domain", "业务域", "network", flow.domains || [], "domainId", "name", "description")}
        ${renderProjectOverviewCardSection("role", "角色", "users", flow.roles || [], "roleId", "name", "description")}
      </div>
    </article>
  `;
}

function renderProjectOverviewCardSection(kind, label, iconName, items, idKey, labelKey, descriptionKey) {
  return `
    <section class="project-overview-section" data-overview-kind="${escapeAttr(kind)}">
      <header>
        ${renderLucideIcon(iconName)}
        <strong>${escapeHtml(label)}</strong>
        <span>${items.length}</span>
      </header>
      <ul>
        ${items.map((item) => renderProjectOverviewCardListItem(kind, item, idKey, labelKey, descriptionKey)).join("") || "<li class=\"empty compact\">暂无数据</li>"}
      </ul>
    </section>
  `;
}

function renderProjectOverviewCardListItem(kind, item, idKey, labelKey, descriptionKey) {
  const itemId = item[idKey];
  const icon = kind === "appSurface"
    ? getAppSurfaceTypeOption(item.type).icon
    : kind === "domain"
      ? "network"
      : "user";
  return `
    <li class="project-overview-list-item" data-overview-kind="${escapeAttr(kind)}" data-overview-item-id="${escapeAttr(itemId)}">
      <span class="project-overview-list-icon" aria-hidden="true">${renderLucideIcon(icon)}</span>
      <span class="project-overview-list-text">
        <strong>${escapeHtml(item[labelKey])}</strong>
        <small>${escapeHtml(item[descriptionKey] || getTaxonomySecondaryText(kind, item) || "无说明")}</small>
      </span>
      ${kind === "appSurface" ? `<span class="project-overview-system-dot" data-project-overview-app-id="${escapeAttr(itemId)}" title="应用端系统连接点" aria-hidden="true"></span>` : ""}
    </li>
  `;
}

function getProjectOverview(flow) {
  flow.projectOverview = flow.projectOverview || { summary: "", goal: "" };
  if (typeof flow.projectOverview.summary !== "string" || !flow.projectOverview.summary.trim()) {
    flow.projectOverview.summary = "";
  }
  if (typeof flow.projectOverview.goal !== "string") {
    flow.projectOverview.goal = "";
  }
  return flow.projectOverview;
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

function renderAppSurfaceSourceCards(flow) {
  return (flow.appSurfaces || []).map((surface, index) => renderAppSurfaceSourceCard(surface, index)).join("");
}

function renderAppSurfaceSourceCard(surface, index) {
  const related = isAppSurfaceRelated(surface);
  const selected = selectedAppSurfaceId === surface.appId;
  const surfaceType = getAppSurfaceTypeOption(surface.type);
  const surfaceEndpoint = { kind: "appSurface", nodeId: surface.appId, appId: surface.appId };
  const surfaceEndpointKey = endpointKey(surfaceEndpoint);
  const pos = appSurfacePositions.get(surface.appId) || appSurfaceSourcePosition(index);
  return `
    <article class="app-surface-card ${selected ? "selected" : ""} ${related ? "" : "dimmed"}"
      data-app-surface-id="${escapeAttr(surface.appId)}"
      style="left: ${pos.x}px; top: ${pos.y}px;">
      <header class="app-surface-card-head">
        <button class="target-dot inlet-dot"
          data-target-kind="appSurface"
          data-target-app-id="${escapeAttr(surface.appId)}"
          data-target-key="${escapeAttr(surfaceEndpointKey)}"
          title="连线入口"
          aria-label="连线入口"></button>
        <div class="node-title">
          <div class="app-surface-title-row">
            <h3>${escapeHtml(surface.name)}</h3>
            ${renderAppSurfaceTypeBadge(surfaceType)}
          </div>
        </div>
        <button class="origin-dot outlet-dot card-outlet ${connectingFrom && endpointKey(connectingFrom) === surfaceEndpointKey ? "active" : ""}"
          data-origin-kind="appSurface"
          data-origin-node-id="${escapeAttr(surface.appId)}"
          data-origin-app-id="${escapeAttr(surface.appId)}"
          data-origin-key="${escapeAttr(surfaceEndpointKey)}"
          title="卡片连线出口"
          aria-label="卡片连线出口"></button>
      </header>
      <p class="purpose">${escapeHtml(surface.description || "暂无介绍")}</p>
    </article>
  `;
}

function renderAppSurfaceTypeBadge(type) {
  return `
    <span class="app-surface-type-badge" title="${escapeAttr(type.label)}">
      ${renderLucideIcon(type.icon)}
      <span>${escapeHtml(type.label)}</span>
    </span>
  `;
}

function appSurfaceSourcePosition(index) {
  return {
    x: APP_SURFACE_SOURCE_X,
    y: APP_SURFACE_SOURCE_Y + index * APP_SURFACE_SOURCE_GAP
  };
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
    return "<p class=\"save-hint\">画布修改会写入 VS Code 文档缓冲区，使用文件保存落盘。</p>";
  }
  return `<p class="save-hint ${escapeAttr(commandStatus.kind)}" role="status">${escapeHtml(commandStatus.message)}</p>`;
}

function renderFloatingTaxonomyControls() {
  const panelButtonId = leftPanelCollapsed ? "expandLeftPanel" : "collapseLeftPanel";
  const panelButtonLabel = leftPanelCollapsed ? "展开左侧栏" : "收起左侧栏";
  const panelButtonIcon = leftPanelCollapsed ? "panel-left-open" : "panel-left-close";
  return `
    <div class="floating-taxonomy-controls" aria-label="应用端、业务域、角色、状态组面板">
      ${renderIconButton(panelButtonId, panelButtonLabel, panelButtonIcon, "floating-icon")}
      ${renderTaxonomyToggleButton("appSurface", "应用端", "monitor-smartphone")}
      ${renderTaxonomyToggleButton("domain", "业务域", "network")}
      ${renderTaxonomyToggleButton("role", "角色", "users")}
      ${renderTaxonomyToggleButton("statusGroup", "状态组", "palette")}
    </div>
  `;
}

function renderTaxonomyToggleButton(kind, label, iconName) {
  const open = taxonomyPanelsOpen[kind] === true;
  return `
    <button type="button" class="icon-button taxonomy-toggle ${open ? "active" : ""}" data-taxonomy-toggle="${escapeAttr(kind)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}" aria-pressed="${open ? "true" : "false"}">
      ${renderLucideIcon(iconName)}
    </button>
  `;
}

function renderTaxonomyPanels(flow) {
  return `
    <div class="floating-taxonomy-panels" aria-label="应用端、业务域、角色、状态组列表">
      ${taxonomyPanelsOpen.appSurface === true ? renderManagedList("appSurface", "应用端", flow.appSurfaces || [], "appId", "name", "description", appFilters) : ""}
      ${taxonomyPanelsOpen.domain === true ? renderManagedList("domain", "业务域", getAvailableDomains(flow), "domainId", "name", "description", domainFilters) : ""}
      ${taxonomyPanelsOpen.role === true ? renderManagedList("role", "角色", getAvailableRoles(flow), "roleId", "name", "description", roleFilters) : ""}
      ${taxonomyPanelsOpen.statusGroup === true ? renderStatusGroupList(getStatusGroups(flow)) : ""}
    </div>
  `;
}

function renderIconButton(id, label, iconName, extraClass = "") {
  return `
    <button type="button" id="${escapeAttr(id)}" class="icon-button ${escapeAttr(extraClass)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
      ${renderLucideIcon(iconName)}
    </button>
  `;
}

function renderIconActionButton(className, label, iconName, attrs = "") {
  return `
    <button type="button" class="icon-button feature-icon-button ${escapeAttr(className)}" ${attrs} title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
      ${renderLucideIcon(iconName)}
    </button>
  `;
}

function renderLucideIcon(name) {
  const icons = {
    "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m16 15-3-3 3-3"></path>',
    "panel-left-open": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m14 9 3 3-3 3"></path>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    "circle-help": '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4"></path><path d="M12 17h.01"></path>',
    component: '<path d="M5.5 8.5 9 12l-3.5 3.5L2 12l3.5-3.5Z"></path><path d="m12 2 3.5 3.5L12 9 8.5 5.5 12 2Z"></path><path d="M18.5 8.5 22 12l-3.5 3.5L15 12l3.5-3.5Z"></path><path d="m12 15 3.5 3.5L12 22l-3.5-3.5L12 15Z"></path>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>',
    globe: '<circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path>',
    "globe-2": '<path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"></path><path d="M7 3.34V5a3 3 0 0 0 3 3 2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"></path><path d="M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"></path><circle cx="12" cy="12" r="10"></circle>',
    "grip-vertical": '<circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle>',
    "layout-template": '<rect width="18" height="7" x="3" y="3" rx="1"></rect><rect width="9" height="7" x="3" y="14" rx="1"></rect><rect width="5" height="7" x="16" y="14" rx="1"></rect>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path>',
    "monitor-smartphone": '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"></path><path d="M10 19v-4"></path><path d="M7 19h5"></path><rect width="6" height="10" x="16" y="12" rx="2"></rect>',
    network: '<rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path>',
    navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>',
    "octagon-alert": '<path d="M12 16h.01"></path><path d="M12 8v4"></path><path d="M15.31 2a2 2 0 0 1 1.42.59l4.68 4.68A2 2 0 0 1 22 8.69v6.62a2 2 0 0 1-.59 1.42l-4.68 4.68a2 2 0 0 1-1.42.59H8.69a2 2 0 0 1-1.42-.59l-4.68-4.68A2 2 0 0 1 2 15.31V8.69a2 2 0 0 1 .59-1.42l4.68-4.68A2 2 0 0 1 8.69 2Z"></path>',
    palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.4-.4-.8-.4-1.3 0-1.1.9-2 2-2H16c3.3 0 6-2.7 6-6 0-4.4-4.5-8-10-8Z"></path>',
    "panel-top": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M3 9h18"></path>',
    "pen-line": '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
    plus: '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
    "scan-line": '<path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path><path d="M7 12h10"></path>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path>',
    "trash-2": '<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
    "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
    x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
  };
  return `<svg class="lucide-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.x}</svg>`;
}

function renderManagedList(kind, label, items, idKey, labelKey, descriptionKey, selectedIds, options = {}) {
  const selectedSet = new Set(selectedIds || []);
  const currentId = getSelectedTaxonomyId(kind);
  const showFilters = options.showFilters !== false;
  const panelClass = options.panelClass || "";
  return `
    <section class="managed-list taxonomy-panel ${escapeAttr(panelClass)}" data-kind="${kind}" data-taxonomy-panel="${kind}">
      <header class="managed-list-head">
        <h4>${label}</h4>
        <div class="tiny-actions">
          ${renderTaxonomyActionButton(kind, "create", "新建", "plus")}
        </div>
      </header>
      <div class="managed-list-body" role="listbox" aria-label="${escapeAttr(label)}列表">
        ${items.map((item) => {
          const itemId = item[idKey];
          const selected = selectedSet.has(itemId);
          const active = itemId === currentId;
          return `
            <div class="managed-list-item ${showFilters ? "" : "without-filter"} ${active ? "active" : ""}" data-kind="${kind}" data-taxonomy-id="${escapeAttr(itemId)}" role="option" tabindex="0" aria-selected="${active ? "true" : "false"}">
              ${showFilters
                ? `<input type="checkbox" class="taxonomy-filter-checkbox" data-kind="${kind}" value="${escapeAttr(itemId)}" ${selected ? "checked" : ""} aria-label="筛选 ${escapeAttr(item[labelKey])}">`
                : `<span class="managed-list-kind-icon" aria-hidden="true">${renderLucideIcon(getManagedListItemIcon(kind, item))}</span>`}
              <span class="managed-list-text">
                <strong>${escapeHtml(item[labelKey])}</strong>
                <small>${escapeHtml(item[descriptionKey] || getTaxonomySecondaryText(kind, item) || "无说明")}</small>
              </span>
              ${renderTaxonomyActionButton(kind, "delete", `删除 ${item[labelKey]}`, "trash-2", false, "danger managed-list-row-action", `data-taxonomy-id="${escapeAttr(itemId)}"`)}
            </div>
          `;
        }).join("") || "<p class=\"empty compact\">暂无数据</p>"}
      </div>
    </section>
  `;
}

function renderStatusGroupList(groups) {
  const currentId = getSelectedTaxonomyId("statusGroup");
  return `
    <section class="managed-list taxonomy-panel status-group-panel" data-kind="statusGroup" data-taxonomy-panel="statusGroup">
      <header class="managed-list-head">
        <h4>状态组</h4>
        <div class="tiny-actions">
          ${renderTaxonomyActionButton("statusGroup", "create", "新增状态组", "plus")}
        </div>
      </header>
      <div class="managed-list-body status-group-list" role="listbox" aria-label="状态组列表">
        ${groups.map((group) => {
          const active = group.statusGroupId === currentId;
          return `
            <div class="managed-list-item status-group-list-item ${active ? "active" : ""}" data-kind="statusGroup" data-taxonomy-id="${escapeAttr(group.statusGroupId)}" role="option" tabindex="0" aria-selected="${active ? "true" : "false"}">
              <span class="status-group-color-square" data-status-group-color="${escapeAttr(normalizeStatusGroupColor(group.color))}" aria-hidden="true"></span>
              <span class="managed-list-text">
                <strong title="${escapeAttr(group.title)}">${escapeHtml(group.title)}</strong>
                <small>${escapeHtml(group.description || "无说明")}</small>
              </span>
              ${renderTaxonomyActionButton("statusGroup", "delete", `删除 ${group.title}`, "trash-2", false, "danger managed-list-row-action", `data-taxonomy-id="${escapeAttr(group.statusGroupId)}"`)}
            </div>
          `;
        }).join("") || "<p class=\"empty compact\">暂无状态组</p>"}
      </div>
    </section>
  `;
}

function renderTaxonomyActionButton(kind, action, label, iconName, disabled = false, extraClass = "", attrs = "") {
  return `
    <button type="button" class="icon-button taxonomy-action ${escapeAttr(extraClass)}" data-kind="${kind}" data-action="${action}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}" ${attrs} ${disabled ? "disabled" : ""}>
      ${renderLucideIcon(iconName)}
    </button>
  `;
}

function getSelectedTaxonomyId(kind) {
  if (kind === "appSurface") {
    return selectedAppSurfaceId;
  }
  if (kind === "domain") {
    return selectedDomainId;
  }
  if (kind === "statusGroup") {
    return selectedStatusGroupId;
  }
  return selectedRoleId;
}

function clearAllTaxonomySelections() {
  return {
    appSurface: "",
    domain: "",
    role: "",
    statusGroup: ""
  };
}

function getTaxonomySecondaryText(kind, item) {
  if (kind === "appSurface") {
    return item.type || "";
  }
  if (kind === "role") {
    return namesByIds(state.flow.domains || [], "domainId", item.domainIds || []);
  }
  return "";
}

function getManagedListItemIcon(kind, item) {
  if (kind === "appSurface") {
    return getAppSurfaceTypeOption(item.type).icon;
  }
  if (kind === "domain") {
    return "network";
  }
  if (kind === "statusGroup") {
    return "palette";
  }
  return "user";
}

function renderNodeCard(flow, node) {
  const related = isNodeRelated(node);
  const groups = getFeatureGroups(node);
  const surfaces = namesByIds(flow.appSurfaces || [], "appId", node.appSurfaceIds || []);
  const domains = namesByIds(flow.domains, "domainId", node.domainIds);
  const roles = namesByIds(flow.roles, "roleId", node.roleIds);
  const statusGroup = getStatusGroup(flow, node.statusGroupId);
  const nodeOrigin = { kind: "node", nodeId: node.nodeId };
  const nodeOriginKey = endpointKey(nodeOrigin);
  const entryAppNames = getEntryAppSurfaceNames(flow, node);
  return `
    <article class="node-card ${isNodeSelected(node.nodeId) ? "selected" : ""} ${related ? "" : "dimmed"}"
      data-node-id="${escapeAttr(node.nodeId)}">
      <header class="node-head">
        <button class="target-dot inlet-dot"
          data-target-node-id="${escapeAttr(node.nodeId)}"
          title="连线入口"
          aria-label="连线入口"></button>
        <div class="node-title">
          <h3>${escapeHtml(node.title)}</h3>
          <small>${escapeHtml(surfaces || "全部应用端")}${entryAppNames ? ` · 起始: ${escapeHtml(entryAppNames)}` : ""}</small>
        </div>
        <span>${escapeHtml(getPageTypeOption(node.pageType).label)}</span>
        <button class="origin-dot outlet-dot card-outlet ${connectingFrom && endpointKey(connectingFrom) === nodeOriginKey ? "active" : ""}"
          data-origin-kind="node"
          data-origin-node-id="${escapeAttr(node.nodeId)}"
          data-origin-key="${escapeAttr(nodeOriginKey)}"
          title="卡片连线出口"
          aria-label="卡片连线出口"></button>
      </header>
      ${renderNodeStatusGroupBadge(statusGroup)}
      <p class="purpose">${escapeHtml(node.purpose)}</p>
      <dl class="meta-grid">
        <dt title="业务域" aria-label="业务域">${renderLucideIcon("globe-2")}</dt><dd>${escapeHtml(domains || "未设置")}</dd>
        <dt title="角色" aria-label="角色">${renderLucideIcon("user")}</dt><dd>${escapeHtml(roles || "未设置")}</dd>
      </dl>
      <div class="feature-groups">
        ${groups.map((group) => renderFeatureGroup(group, node.nodeId)).join("") || "<p class=\"empty compact\">暂无功能</p>"}
      </div>
    </article>
  `;
}

function renderNodeStatusGroupBadge(statusGroup) {
  if (!statusGroup) {
    return "";
  }
  const title = statusGroup.title || "未命名状态组";
  return `
    <div class="node-status-group" title="状态组: ${escapeAttr(title)}">
      <span class="status-group-color-square small" data-status-group-color="${escapeAttr(normalizeStatusGroupColor(statusGroup.color))}" aria-hidden="true"></span>
      <span>${escapeHtml(title)}</span>
    </div>
  `;
}

function renderFeatureGroup(group, nodeId) {
  const endpoint = { kind: "featureGroup", nodeId, groupId: group.groupId };
  const key = endpointKey(endpoint);
  return `
    <section class="feature-group" data-feature-group-id="${escapeAttr(group.groupId)}">
      <div class="feature-group-head">
        <div>
          <strong>${escapeHtml(group.name)}</strong>
          <small>${escapeHtml(group.type)} · ${escapeHtml(group.description || "无说明")}</small>
        </div>
        <button class="origin-dot outlet-dot small ${connectingFrom && endpointKey(connectingFrom) === key ? "active" : ""}"
          data-origin-kind="featureGroup"
          data-origin-node-id="${escapeAttr(nodeId)}"
          data-origin-group-id="${escapeAttr(group.groupId)}"
          data-origin-key="${escapeAttr(key)}"
          title="功能分组出口"
          aria-label="功能分组出口"></button>
      </div>
      <ul class="feature-items">
        ${(group.items || []).map((item) => renderFeatureItem(item, nodeId, group.groupId)).join("") || "<li class=\"empty compact\">暂无功能项</li>"}
      </ul>
    </section>
  `;
}

function renderFeatureItem(item, nodeId, groupId) {
  const endpoint = { kind: "featureItem", nodeId, groupId, itemId: item.itemId };
  const key = endpointKey(endpoint);
  return `
    <li class="feature-item" data-feature-item-id="${escapeAttr(item.itemId)}">
      <div>
        <span>${escapeHtml(item.name)}</span>
        <small>${escapeHtml(item.type)} · ${escapeHtml(item.description || "无说明")}</small>
      </div>
      <button class="origin-dot outlet-dot tiny ${connectingFrom && endpointKey(connectingFrom) === key ? "active" : ""}"
        data-origin-kind="featureItem"
        data-origin-node-id="${escapeAttr(nodeId)}"
        data-origin-group-id="${escapeAttr(groupId)}"
        data-origin-item-id="${escapeAttr(item.itemId)}"
        data-origin-key="${escapeAttr(key)}"
        title="功能项出口"
        aria-label="功能项出口"></button>
    </li>
  `;
}

function renderNodeInspector(flow, node) {
  return `
    <form class="details-form" id="nodeDetailsForm" data-inspector-key="${escapeAttr(inspectorScrollKey("node", node.nodeId))}">
      <header class="inspector-head">
        <div>
          <h2 id="nodePanelTitle" class="inline-title-editor" tabindex="0" title="双击编辑标题">${escapeHtml(node.title)}</h2>
          <code>${escapeHtml(node.nodeId)}</code>
        </div>
        <div class="inspector-actions">
          ${renderIconButton("closeInspector", "关闭详情", "x")}
        </div>
      </header>
      <input id="nodeTitle" type="hidden" value="${escapeAttr(node.title)}">
      ${renderPageTypePicker(node.pageType)}
      <label>页面目的
        <textarea id="nodePurpose" rows="4">${escapeHtml(node.purpose)}</textarea>
      </label>
      ${renderStatusGroupSelect(flow, node)}
      ${renderTagMultiSelect("nodeAppSurfaceIds", "应用端", flow.appSurfaces || [], "appId", "name", node.appSurfaceIds || [])}
      ${renderTagMultiSelect("nodeDomainIds", "业务域", flow.domains, "domainId", "name", node.domainIds || [])}
      ${renderTagMultiSelect("nodeRoleIds", "角色", flow.roles, "roleId", "name", node.roleIds || [])}
      <section class="feature-editor-section">
        <div class="section-title">
          <h3>功能分组</h3>
          ${renderIconButton("addFeatureGroup", "新建功能分组", "plus", "feature-icon-button")}
        </div>
        <div id="featureEditor" class="feature-editor">
          ${renderFeatureEditorGroups(getFeatureGroups(node))}
        </div>
      </section>
      <p class="form-error" id="nodeFormError"></p>
    </form>
  `;
}

function renderPageTypePicker(pageType) {
  const selected = getPageTypeOption(pageType);
  return `
    <div class="page-type-field">
      <span class="field-label">页面类型</span>
      <input id="nodePageType" type="hidden" value="${escapeAttr(selected.value)}">
      <div class="page-type-picker" data-page-type-picker>
        <button type="button"
          class="page-type-trigger"
          data-page-type-value="${escapeAttr(selected.value)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderPageTypeOptionContent(selected)}
        </button>
        <div class="page-type-menu" role="listbox" aria-label="页面类型">
          ${PAGE_TYPE_OPTIONS.map((type) => `
            <button type="button"
              class="page-type-option ${type.value === selected.value ? "selected" : ""}"
              data-page-type-option="${escapeAttr(type.value)}"
              role="option"
              aria-selected="${type.value === selected.value ? "true" : "false"}">
              ${renderPageTypeOptionContent(type)}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderPageTypeOptionContent(type) {
  return `
    <span class="page-type-icon" aria-hidden="true">${renderLucideIcon(type.icon)}</span>
    <span class="page-type-copy">
      <strong>${escapeHtml(type.label)}</strong>
    </span>
  `;
}

function renderAppSurfaceTypePicker(surfaceType) {
  const selected = getAppSurfaceTypeOption(surfaceType);
  return `
    <div class="app-surface-type-field">
      <span class="field-label">应用端类型</span>
      <input id="appSurfaceType" type="hidden" value="${escapeAttr(selected.value)}">
      <div class="app-surface-type-picker" data-app-surface-type-picker>
        <button type="button"
          class="app-surface-type-trigger"
          data-app-surface-type-value="${escapeAttr(selected.value)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderAppSurfaceTypeOptionContent(selected)}
        </button>
        <div class="app-surface-type-menu" role="listbox" aria-label="应用端类型">
          ${APP_SURFACE_TYPE_OPTIONS.map((type) => `
            <button type="button"
              class="app-surface-type-option ${type.value === selected.value ? "selected" : ""}"
              data-app-surface-type-option="${escapeAttr(type.value)}"
              role="option"
              aria-selected="${type.value === selected.value ? "true" : "false"}">
              ${renderAppSurfaceTypeOptionContent(type)}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderAppSurfaceTypeOptionContent(type) {
  return `
    <span class="app-surface-type-icon" aria-hidden="true">${renderLucideIcon(type.icon)}</span>
    <span class="app-surface-type-copy">
      <strong>${escapeHtml(type.label)}</strong>
    </span>
  `;
}

function renderStatusGroupSelect(flow, node) {
  const groups = getStatusGroups(flow);
  const selectedGroup = groups.find((group) => group.statusGroupId === node.statusGroupId) || null;
  const selectedId = selectedGroup?.statusGroupId || "";
  return `
    <div class="status-group-field">
      <span class="field-label">状态组</span>
      <input id="nodeStatusGroupId" type="hidden" value="${escapeAttr(selectedId)}">
      <div class="status-group-picker" data-status-group-picker>
        <button type="button"
          class="status-group-trigger"
          data-status-group-value="${escapeAttr(selectedId)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderStatusGroupOptionContent(selectedGroup)}
        </button>
        <div class="status-group-menu" role="listbox" aria-label="状态组">
          <button type="button"
            class="status-group-option ${selectedId ? "" : "selected"}"
            data-status-group-option=""
            role="option"
            aria-selected="${selectedId ? "false" : "true"}">
            ${renderStatusGroupOptionContent(null)}
          </button>
          ${groups.map((group) => `
            <button type="button"
              class="status-group-option ${selectedId === group.statusGroupId ? "selected" : ""}"
              data-status-group-option="${escapeAttr(group.statusGroupId)}"
              role="option"
              aria-selected="${selectedId === group.statusGroupId ? "true" : "false"}">
              ${renderStatusGroupOptionContent(group)}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderStatusGroupOptionContent(statusGroup) {
  if (!statusGroup) {
    return `
      <span class="status-group-picker-swatch empty" aria-hidden="true"></span>
      <span class="status-group-picker-copy">
        <strong>无状态组</strong>
      </span>
    `;
  }
  return `
    <span class="status-group-color-square status-group-picker-swatch" data-status-group-color="${escapeAttr(normalizeStatusGroupColor(statusGroup.color))}" aria-hidden="true"></span>
    <span class="status-group-picker-copy">
      <strong>${escapeHtml(statusGroup.title)}</strong>
    </span>
  `;
}

function renderProjectOverviewInspector(flow) {
  const overview = getProjectOverview(flow);
  return `
    <form class="details-form" id="projectOverviewDetailsForm" data-inspector-key="${escapeAttr(inspectorScrollKey("projectOverview", PROJECT_OVERVIEW_NODE_ID))}">
      <header class="inspector-head">
        <div>
          <h2 id="projectOverviewPanelTitle" class="inline-title-editor" tabindex="0" title="双击编辑标题">${escapeHtml(flow.title || "项目概述")}</h2>
          <code>${escapeHtml(PROJECT_OVERVIEW_NODE_ID)}</code>
        </div>
        ${renderIconButton("closeInspector", "关闭详情", "x")}
      </header>
      <input id="projectOverviewTitle" type="hidden" value="${escapeAttr(flow.title || "项目概述")}">
      <label>项目综述
        <textarea id="projectOverviewSummary" rows="5">${escapeHtml(overview.summary || "")}</textarea>
      </label>
      <label>项目目标
        <textarea id="projectOverviewGoal" rows="5">${escapeHtml(overview.goal || "")}</textarea>
      </label>
      <section class="project-overview-inspector-taxonomy">
        <div class="section-title">
          <h3>应用端</h3>
        </div>
        ${renderManagedList("appSurface", "应用端", flow.appSurfaces || [], "appId", "name", "description", [], { showFilters: false, panelClass: "embedded-taxonomy-panel" })}
        <div class="section-title">
          <h3>业务域</h3>
        </div>
        ${renderManagedList("domain", "业务域", flow.domains || [], "domainId", "name", "description", [], { showFilters: false, panelClass: "embedded-taxonomy-panel" })}
        <div class="section-title">
          <h3>角色</h3>
        </div>
        ${renderManagedList("role", "角色", flow.roles || [], "roleId", "name", "description", [], { showFilters: false, panelClass: "embedded-taxonomy-panel" })}
      </section>
      <p class="form-error" id="projectOverviewFormError"></p>
    </form>
  `;
}

function renderAppSurfaceInspector(flow, surface) {
  return `
    <form class="details-form" id="appSurfaceDetailsForm">
      <header class="inspector-head">
        <div>
          <h2 id="appSurfacePanelTitle" class="inline-title-editor" tabindex="0" title="双击编辑标题">${escapeHtml(surface.name)}</h2>
          <code>${escapeHtml(surface.appId)}</code>
        </div>
        ${renderIconButton("closeInspector", "关闭详情", "x")}
      </header>
      <input id="appSurfaceName" type="hidden" value="${escapeAttr(surface.name)}">
      ${renderAppSurfaceTypePicker(surface.type)}
      <label>应用端介绍
        <textarea id="appSurfaceDescription" rows="4">${escapeHtml(surface.description || "")}</textarea>
      </label>
      ${renderTagMultiSelect("appSurfaceDomainIds", "关联业务域", flow.domains || [], "domainId", "name", surface.domainIds || [])}
      ${renderTagMultiSelect("appSurfaceRoleIds", "关联角色", flow.roles || [], "roleId", "name", surface.roleIds || [])}
      <p class="form-error" id="appSurfaceFormError"></p>
    </form>
  `;
}

function renderDomainInspector(domain) {
  return `
    <form class="details-form" id="domainDetailsForm">
      <header class="inspector-head">
        <div>
          <h2 id="domainPanelTitle" class="inline-title-editor" tabindex="0" title="双击编辑标题">${escapeHtml(domain.name)}</h2>
          <code>${escapeHtml(domain.domainId)}</code>
        </div>
        ${renderIconButton("closeInspector", "关闭详情", "x")}
      </header>
      <input id="domainName" type="hidden" value="${escapeAttr(domain.name)}">
      <label>业务域说明
        <textarea id="domainDescription" rows="4">${escapeHtml(domain.description || "")}</textarea>
      </label>
      <p class="form-error" id="domainFormError"></p>
    </form>
  `;
}

function renderRoleInspector(flow, role) {
  return `
    <form class="details-form" id="roleDetailsForm">
      <header class="inspector-head">
        <div>
          <h2 id="rolePanelTitle" class="inline-title-editor" tabindex="0" title="双击编辑标题">${escapeHtml(role.name)}</h2>
          <code>${escapeHtml(role.roleId)}</code>
        </div>
        ${renderIconButton("closeInspector", "关闭详情", "x")}
      </header>
      <input id="roleName" type="hidden" value="${escapeAttr(role.name)}">
      <label>角色说明
        <textarea id="roleDescription" rows="4">${escapeHtml(role.description || "")}</textarea>
      </label>
      ${renderMultiSelect("roleDomainIds", "关联业务域", flow.domains || [], "domainId", "name", role.domainIds || [])}
      <p class="form-error" id="roleFormError"></p>
    </form>
  `;
}

function renderStatusGroupInspector(statusGroup) {
  const color = normalizeStatusGroupColor(statusGroup.color);
  return `
    <form class="details-form" id="statusGroupDetailsForm" data-inspector-key="${escapeAttr(inspectorScrollKey("statusGroup", statusGroup.statusGroupId))}">
      <header class="inspector-head">
        <div>
          <h2 id="statusGroupPanelTitle" class="inline-title-editor" tabindex="0" title="双击编辑标题">${escapeHtml(statusGroup.title)}</h2>
          <code>${escapeHtml(statusGroup.statusGroupId)}</code>
        </div>
        ${renderIconButton("closeInspector", "关闭详情", "x")}
      </header>
      <input id="statusGroupTitle" type="hidden" value="${escapeAttr(statusGroup.title)}">
      <label>状态组说明
        <textarea id="statusGroupDescription" rows="4">${escapeHtml(statusGroup.description || "")}</textarea>
      </label>
      <label class="status-group-color-field">颜色
        <span class="status-group-color-control">
          <input id="statusGroupColor" type="color" value="${escapeAttr(color)}">
          <span class="status-group-color-value">${escapeHtml(color)}</span>
        </span>
      </label>
      <p class="form-error" id="statusGroupFormError"></p>
    </form>
  `;
}

function renderEdgeInspector(flow, edge) {
  const selectedType = normalizeEdgeTypeForSelect(edge.type);
  const triggerRule = edge.trigger || edge.action || "";
  return `
    <form class="details-form" id="edgeDetailsForm" data-inspector-key="${escapeAttr(inspectorScrollKey("edge", edge.edgeId))}">
      <header class="inspector-head">
        <div>
          <h2 id="edgePanelTitle" class="inline-title-editor" tabindex="0" title="双击编辑标题">${escapeHtml(triggerRule)}</h2>
          <code>${escapeHtml(edge.edgeId)}</code>
        </div>
        ${renderIconButton("closeInspector", "关闭详情", "x")}
      </header>
      <input id="edgeTriggerRule" type="hidden" value="${escapeAttr(triggerRule)}">
      ${renderEndpointPicker("edgeFromEndpoint", "起点", flow, edge.from || { kind: "node", nodeId: edge.fromNodeId }, true)}
      ${renderEndpointPicker("edgeToEndpoint", "终点", flow, edge.to || { kind: "node", nodeId: edge.toNodeId }, false)}
      ${renderEdgeTypePicker(selectedType)}
      <label>条件描述
        <textarea id="edgeCondition" rows="3">${escapeHtml(edge.condition || "")}</textarea>
      </label>
      ${renderTagMultiSelect("edgeAppSurfaceIds", "应用端", flow.appSurfaces || [], "appId", "name", edge.appSurfaceIds || [])}
      ${renderTagMultiSelect("edgeDomainIds", "业务域", flow.domains, "domainId", "name", edge.domainIds || [])}
      ${renderTagMultiSelect("edgeRoleIds", "角色", flow.roles, "roleId", "name", edge.roleIds || [])}
      <p class="form-error" id="edgeFormError"></p>
    </form>
  `;
}

function renderEdgeTypePicker(selectedType) {
  const selected = getEdgeTypeOption(selectedType);
  return `
    <div class="edge-type-field">
      <span class="field-label">路径类型</span>
      <div class="edge-type-picker" data-edge-type-picker>
        <button type="button"
          id="edgeType"
          class="edge-type-trigger"
          data-edge-type-value="${escapeAttr(selected.value)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderEdgeTypeOptionContent(selected)}
        </button>
        <div class="edge-type-menu" role="listbox" aria-label="路径类型">
          ${EDGE_TYPE_OPTIONS.map((type) => `
            <button type="button"
              class="edge-type-option ${type.value === selected.value ? "selected" : ""}"
              data-edge-type-option="${escapeAttr(type.value)}"
              role="option"
              aria-selected="${type.value === selected.value ? "true" : "false"}">
              ${renderEdgeTypeOptionContent(type)}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderEdgeTypeOptionContent(type) {
  return `
    <span class="edge-type-swatch" data-edge-type-color="${escapeAttr(type.color)}" aria-hidden="true"></span>
    <span class="edge-type-copy">
      <strong>${escapeHtml(type.label)}</strong>
      <small>${escapeHtml(type.description)}</small>
    </span>
  `;
}

function renderMultiSelect(id, label, options, idKey, labelKey, selected) {
  const selectedSet = new Set(selected || []);
  const size = Math.min(5, Math.max(2, options.length || 2));
  return `
    <label>${label}
      <select id="${id}" multiple size="${size}">
        ${options.map((item) => `<option value="${escapeAttr(item[idKey])}" ${selectedSet.has(item[idKey]) ? "selected" : ""}>${escapeHtml(item[labelKey])}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderEndpointPicker(id, label, flow, selectedEndpoint, includeFeatureEndpoints) {
  const selectedValue = encodeEndpoint(selectedEndpoint);
  const selectedLabel = endpointDisplayLabel(flow, selectedEndpoint);
  const nodes = flow.nodes.filter((node) => node.status !== "removed");
  const appSurfaces = flow.appSurfaces || [];
  const placeholder = includeFeatureEndpoints
    ? "检索并选择应用端 / 节点卡片 / 功能分组 / 功能项"
    : "检索并选择目标应用端 / 节点卡片";
  return `
    <div class="endpoint-picker">
      <label>${label}
        <div class="endpoint-combobox" data-endpoint-picker="${escapeAttr(id)}">
          <input id="${escapeAttr(id)}" class="endpoint-combobox-input"
            value="${escapeAttr(selectedLabel)}"
            data-endpoint-value="${escapeAttr(selectedValue)}"
            data-endpoint-label="${escapeAttr(selectedLabel)}"
            placeholder="${escapeAttr(placeholder)}"
            autocomplete="off"
            role="combobox"
            aria-expanded="false"
            aria-controls="${escapeAttr(id)}Menu">
          <div id="${escapeAttr(id)}Menu" class="endpoint-menu" role="listbox">
          ${renderEndpointProjectOverviewOption(flow, selectedValue)}
          ${appSurfaces.map((surface) => renderEndpointAppSurfaceOption(surface, selectedValue)).join("")}
          ${nodes.map((node) => renderEndpointNodeOptions(node, selectedValue, includeFeatureEndpoints)).join("")}
          </div>
        </div>
      </label>
    </div>
  `;
}

function renderEndpointProjectOverviewOption(flow, selectedValue) {
  const endpoint = { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  const search = endpointSearchText([flow.title, flow.projectOverview?.summary, flow.projectOverview?.goal]);
  return renderEndpointOption(endpoint, `项目概述 · ${flow.title || "项目概述"}`, search, selectedValue, "standalone-option");
}

function renderEndpointAppSurfaceOption(surface, selectedValue) {
  const endpoint = { kind: "appSurface", nodeId: surface.appId, appId: surface.appId };
  const search = endpointSearchText([surface.name, surface.type, surface.description]);
  return renderEndpointOption(endpoint, `应用端卡片 · ${surface.name}`, search, selectedValue, "standalone-option");
}

function renderEndpointNodeOptions(node, selectedValue, includeFeatureEndpoints) {
  const nodeEndpoint = { kind: "node", nodeId: node.nodeId };
  const nodeSearch = endpointSearchText([node.title, node.pageType, node.purpose]);
  return `
    <div class="endpoint-cascade-node" data-search="${escapeAttr(nodeSearch)}">
      ${renderEndpointOption(nodeEndpoint, `节点卡片 · ${node.title}`, nodeSearch, selectedValue)}
      ${includeFeatureEndpoints ? `
        <div class="endpoint-cascade-children">
          ${getFeatureGroups(node).map((group) => renderEndpointGroupOptions(node, group, selectedValue)).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderEndpointGroupOptions(node, group, selectedValue) {
  const groupEndpoint = { kind: "featureGroup", nodeId: node.nodeId, groupId: group.groupId };
  const groupSearch = endpointSearchText([node.title, group.name, group.type, group.description]);
  return `
    <div class="endpoint-cascade-group" data-search="${escapeAttr(groupSearch)}">
      ${renderEndpointOption(groupEndpoint, `功能分组 · ${group.name}`, groupSearch, selectedValue)}
      <div class="endpoint-cascade-children">
        ${(group.items || []).map((item) => {
          const itemEndpoint = { kind: "featureItem", nodeId: node.nodeId, groupId: group.groupId, itemId: item.itemId };
          const itemSearch = endpointSearchText([node.title, group.name, item.name, item.type, item.description]);
          return renderEndpointOption(itemEndpoint, `功能项 · ${item.name}`, itemSearch, selectedValue);
        }).join("")}
      </div>
    </div>
  `;
}

function renderEndpointOption(endpoint, label, searchText, selectedValue, extraClass = "") {
  const value = encodeEndpoint(endpoint);
  const kindClass = endpoint.kind === "appSurface" ? "app-surface-option" : endpoint.kind === "projectOverview" ? "project-overview-option" : endpoint.kind === "node" ? "node-option" : endpoint.kind === "featureGroup" ? "group-option" : "item-option";
  return `
    <button type="button"
      class="endpoint-option ${kindClass} ${escapeAttr(extraClass)} ${value === selectedValue ? "selected" : ""}"
      data-endpoint-value="${escapeAttr(value)}"
      data-endpoint-label="${escapeAttr(label)}"
      data-search="${escapeAttr(searchText)}"
      role="option"
      aria-selected="${value === selectedValue ? "true" : "false"}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderTagMultiSelect(id, label, options, idKey, labelKey, selected) {
  const selectedSet = new Set(selected || []);
  const selectedLabels = options
    .filter((item) => selectedSet.has(item[idKey]))
    .map((item) => item[labelKey]);
  return `
    <details class="tag-multi-select">
      <summary>
        <span>${escapeHtml(label)}</span>
        <span class="tag-summary">
          ${selectedLabels.length ? selectedLabels.map((name) => `<span class="selected-tag">${escapeHtml(name)}</span>`).join("") : "<span class=\"muted-tag\">未选择</span>"}
        </span>
      </summary>
      <div id="${escapeAttr(id)}" class="tag-options" data-tag-multi-select="${escapeAttr(id)}">
        ${options.map((item) => `
          <label class="tag-option">
            <input type="checkbox" value="${escapeAttr(item[idKey])}" ${selectedSet.has(item[idKey]) ? "checked" : ""}>
            <span>${escapeHtml(item[labelKey])}</span>
          </label>
        `).join("") || "<p class=\"empty compact\">暂无可选项</p>"}
      </div>
    </details>
  `;
}

function renderFeatureEditorGroups(groups) {
  return groups.map((group, groupIndex) => `
    <section class="feature-edit-group" data-group-index="${groupIndex}" data-group-id="${escapeAttr(group.groupId || makeClientId("group"))}">
      <div class="feature-edit-group-head" data-drop-kind="group" data-group-index="${groupIndex}">
        ${renderIconActionButton("drag-handle", "拖拽排序功能分组", "grip-vertical", `data-drag-kind="group" data-group-index="${groupIndex}"`)}
        <input class="group-name" value="${escapeAttr(group.name || "")}" placeholder="分组名称">
        <input class="group-type" value="${escapeAttr(group.type || "section")}" placeholder="类型">
        ${renderIconActionButton("add-feature-item", "新建功能项", "plus", `data-group-index="${groupIndex}"`)}
        ${renderIconActionButton("delete-feature-group danger-text", "删除功能分组", "trash-2", `data-group-index="${groupIndex}"`)}
      </div>
      <textarea class="group-description" rows="2" placeholder="分组说明">${escapeHtml(group.description || "")}</textarea>
      <div class="feature-edit-items" data-drop-kind="items" data-group-index="${groupIndex}">
        ${(group.items || []).map((item, itemIndex) => renderFeatureEditorItem(item, groupIndex, itemIndex)).join("")}
      </div>
    </section>
  `).join("") || "<p class=\"empty\">暂无功能分组</p>";
}

function renderFeatureEditorItem(item, groupIndex, itemIndex) {
  return `
    <div class="feature-edit-item" data-group-index="${groupIndex}" data-item-index="${itemIndex}" data-item-id="${escapeAttr(item.itemId || makeClientId("item"))}" data-item-required="${item.required ? "true" : "false"}">
      <div class="feature-edit-item-main">
        ${renderIconActionButton("drag-handle", "拖拽排序功能项", "grip-vertical", `data-drag-kind="item" data-group-index="${groupIndex}" data-item-index="${itemIndex}"`)}
        <input class="item-name" value="${escapeAttr(item.name || "")}" placeholder="功能项名称">
        <input class="item-type" value="${escapeAttr(item.type || "text")}" placeholder="类型">
        ${renderIconActionButton("delete-feature-item danger-text", "删除功能项", "trash-2", `data-group-index="${groupIndex}" data-item-index="${itemIndex}"`)}
      </div>
      <textarea class="item-description" rows="2" placeholder="功能项介绍">${escapeHtml(item.description || "")}</textarea>
    </div>
  `;
}
