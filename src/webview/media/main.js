(function () {
  const vscode = acquireVsCodeApi();
  const state = window.__MINDFLOW_STATE__;
  const app = document.getElementById("app");
  const persisted = vscode.getState() || {};

  const CARD_WIDTH = 300;
  const CARD_MIN_HEIGHT = 230;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 2.6;
  const EDGE_TYPE_OPTIONS = [
    { value: "interaction", label: "交互触发" },
    { value: "autoNavigate", label: "自动跳转" },
    { value: "dataFlow", label: "数据流转" }
  ];
  const PENDING_EDGE_DETAILS_TTL_MS = 15000;
  const APP_SURFACE_SOURCE_X = -360;
  const APP_SURFACE_SOURCE_Y = 0;
  const APP_SURFACE_SOURCE_GAP = 240;

  let selectedNodeId = state.selectedNodeId || "";
  let selectedEdgeId = state.selectedEdgeId || "";
  let selectedAppSurfaceId = state.selectedAppSurfaceId || persisted.selectedAppSurfaceId || "";
  let selectedDomainId = state.selectedDomainId || persisted.selectedDomainId || "";
  let selectedRoleId = state.selectedRoleId || persisted.selectedRoleId || "";
  let appFilters = readIdSelection(persisted.appFilters, persisted.appFilter);
  let domainFilters = readIdSelection(persisted.domainFilters, persisted.domainFilter);
  let roleFilters = readIdSelection(persisted.roleFilters, persisted.roleFilter);
  let taxonomySelection = readTaxonomySelection(persisted.taxonomySelection);
  selectedAppSurfaceId ||= taxonomySelection.appSurface;
  selectedDomainId ||= taxonomySelection.domain;
  selectedRoleId ||= taxonomySelection.role;
  let taxonomyPanelsOpen = readTaxonomyPanelsOpen(persisted.taxonomyPanelsOpen);
  let nodeSearch = persisted.nodeSearch || "";
  let leftPanelCollapsed = Boolean(persisted.leftPanelCollapsed);
  let zoom = clamp(Number(persisted.zoom || 1), MIN_ZOOM, MAX_ZOOM);
  let camera = persisted.camera && Number.isFinite(persisted.camera.x) && Number.isFinite(persisted.camera.y)
    ? { x: persisted.camera.x, y: persisted.camera.y }
    : { x: 340, y: 120 };
  let connectingFrom = persisted.connectingFrom || null;
  let connectionDrag = null;
  let connectionDropTarget = null;
  let dragState = null;
  let panState = null;
  let suppressNextCanvasClick = false;
  let featureDrag = null;
  let nodeDetailsSaveTimer = null;
  let appSurfaceDetailsSaveTimer = null;
  let domainDetailsSaveTimer = null;
  let roleDetailsSaveTimer = null;
  let edgeDetailsSaveTimer = null;
  let edgeDetailsSaveRevision = 0;
  let pendingEdgeDetailsSaves = readPendingEdgeDetailsSaves(persisted.pendingEdgeDetailsSaves);
  let framePending = false;
  const nodePositions = new Map();
  const appSurfacePositions = new Map();

  function render() {
    const flow = state.flow;
    seedNodePositions(flow);
    seedAppSurfacePositions(flow);
    normalizeFilters();

    const selectedNode = flow.nodes.find((node) => node.nodeId === selectedNodeId && node.status !== "removed") || null;
    const selectedEdge = flow.edges.find((edge) => edge.edgeId === selectedEdgeId && edge.status === "active") || null;
    const selectedAppSurface = (flow.appSurfaces || []).find((surface) => surface.appId === selectedAppSurfaceId) || null;
    const selectedDomain = (flow.domains || []).find((domain) => domain.domainId === selectedDomainId) || null;
    const selectedRole = (flow.roles || []).find((role) => role.roleId === selectedRoleId) || null;
    const activeNodes = flow.nodes.filter((node) => node.status !== "removed");
    const visibleListNodes = activeNodes.filter((node) => matchesNodeSearch(flow, node, nodeSearch));

    app.innerHTML = `
      <main class="app-shell ${leftPanelCollapsed ? "left-collapsed" : ""} ${selectedNode || selectedEdge || selectedAppSurface || selectedDomain || selectedRole ? "" : "inspector-collapsed"}">
        <aside class="left-panel">
          <section class="node-sidebar">
            <header class="nodes-toolbar">
              <div class="nodes-toolbar-title">
                <h2>节点</h2>
                <small>${visibleListNodes.length}/${activeNodes.length}</small>
              </div>
              <div class="toolbar-actions" aria-label="节点操作">
                ${renderIconButton("generateFullPrd", "生成完整 PRD", "file-text")}
                ${renderIconButton("generateFullPencil", "生成完整 Pencil", "pen-line")}
                ${renderIconButton("collapseLeftPanel", "收起左侧栏", "panel-left-close")}
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
          ${leftPanelCollapsed ? renderFloatingLeftActions() : ""}
          ${renderFloatingTaxonomyControls()}
          ${renderTaxonomyPanels(flow)}
          <svg class="edge-layer" id="edgeLayer"></svg>
          <div class="world" id="world">
            ${renderAppSurfaceSourceCards(flow)}
            ${activeNodes.map((node) => renderNodeCard(flow, node)).join("")}
          </div>
          <div class="zoom-pill">${Math.round(zoom * 100)}%</div>
        </section>

        <aside class="inspector">
          ${selectedAppSurface ? renderAppSurfaceInspector(flow, selectedAppSurface) : selectedDomain ? renderDomainInspector(selectedDomain) : selectedRole ? renderRoleInspector(flow, selectedRole) : selectedEdge ? renderEdgeInspector(flow, selectedEdge) : selectedNode ? renderNodeInspector(flow, selectedNode) : ""}
        </aside>
      </main>
    `;

    bindEvents();
    positionCards();
    applyCamera();
    persistUiState();
    scheduleDrawEdges();
  }

  function renderNodeListItem(flow, node) {
    const related = isNodeRelated(node);
    return `
      <button class="node-list-item ${selectedNodeId === node.nodeId ? "selected" : ""} ${related ? "" : "dimmed"}"
        data-list-node-id="${escapeAttr(node.nodeId)}">
        <span>${escapeHtml(node.title)}</span>
      </button>
    `;
  }

  function renderAppSurfaceSourceCards(flow) {
    return (flow.appSurfaces || []).map((surface, index) => renderAppSurfaceSourceCard(surface, index)).join("");
  }

  function renderAppSurfaceSourceCard(surface, index) {
    const related = isAppSurfaceRelated(surface);
    const selected = selectedAppSurfaceId === surface.appId;
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
            <h3>${escapeHtml(surface.name)}</h3>
            <small>${escapeHtml(surface.type || "other")}</small>
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
      <p class="save-hint">画布修改会写入 VSCode 文档缓冲区，使用文件保存落盘。</p>
    `;
  }

  function renderFloatingTaxonomyControls() {
    return `
      <div class="floating-taxonomy-controls" aria-label="应用端、业务域、角色面板">
        ${renderTaxonomyToggleButton("appSurface", "应用端", "monitor-smartphone")}
        ${renderTaxonomyToggleButton("domain", "业务域", "network")}
        ${renderTaxonomyToggleButton("role", "角色", "users")}
      </div>
    `;
  }

  function renderTaxonomyToggleButton(kind, label, iconName) {
    const open = taxonomyPanelsOpen[kind] !== false;
    return `
      <button type="button" class="icon-button taxonomy-toggle ${open ? "active" : ""}" data-taxonomy-toggle="${escapeAttr(kind)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}" aria-pressed="${open ? "true" : "false"}">
        ${renderLucideIcon(iconName)}
      </button>
    `;
  }

  function renderTaxonomyPanels(flow) {
    return `
      <div class="floating-taxonomy-panels" aria-label="应用端、业务域、角色列表">
        ${taxonomyPanelsOpen.appSurface === false ? "" : renderManagedList("appSurface", "应用端", flow.appSurfaces || [], "appId", "name", "description", appFilters)}
        ${taxonomyPanelsOpen.domain === false ? "" : renderManagedList("domain", "业务域", getAvailableDomains(flow), "domainId", "name", "description", domainFilters)}
        ${taxonomyPanelsOpen.role === false ? "" : renderManagedList("role", "角色", getAvailableRoles(flow), "roleId", "name", "description", roleFilters)}
      </div>
    `;
  }

  function renderFloatingLeftActions() {
    return `
      <div class="floating-left-actions" aria-label="节点操作">
        ${renderIconButton("expandLeftPanel", "展开左侧栏", "panel-left-open", "floating-icon")}
        ${renderIconButton("floatingGenerateFullPrd", "生成完整 PRD", "file-text", "floating-icon")}
        ${renderIconButton("floatingGenerateFullPencil", "生成完整 Pencil", "pen-line", "floating-icon")}
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
      "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>',
      "grip-vertical": '<circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle>',
      "monitor-smartphone": '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"></path><path d="M10 19v-4"></path><path d="M7 19h5"></path><rect width="6" height="10" x="16" y="12" rx="2"></rect>',
      network: '<rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path>',
      "pen-line": '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
      plus: '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
      "trash-2": '<path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
      x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
    };
    return `<svg class="lucide-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.x}</svg>`;
  }

  function renderManagedList(kind, label, items, idKey, labelKey, descriptionKey, selectedIds) {
    const selectedSet = new Set(selectedIds || []);
    const currentId = getSelectedTaxonomyId(kind);
    return `
      <section class="managed-list taxonomy-panel" data-kind="${kind}" data-taxonomy-panel="${kind}">
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
              <div class="managed-list-item ${active ? "active" : ""}" data-kind="${kind}" data-taxonomy-id="${escapeAttr(itemId)}" role="option" tabindex="0" aria-selected="${active ? "true" : "false"}">
                <input type="checkbox" class="taxonomy-filter-checkbox" data-kind="${kind}" value="${escapeAttr(itemId)}" ${selected ? "checked" : ""} aria-label="筛选 ${escapeAttr(item[labelKey])}">
                <span class="managed-list-text">
                  <strong>${escapeHtml(item[labelKey])}</strong>
                  <small>${escapeHtml(item[descriptionKey] || getTaxonomySecondaryText(kind, item) || "无说明")}</small>
                </span>
              </div>
            `;
          }).join("") || "<p class=\"empty compact\">暂无数据</p>"}
        </div>
      </section>
    `;
  }

  function renderTaxonomyActionButton(kind, action, label, iconName, disabled = false, extraClass = "") {
    return `
      <button type="button" class="icon-button taxonomy-action ${escapeAttr(extraClass)}" data-kind="${kind}" data-action="${action}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}" ${disabled ? "disabled" : ""}>
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
    return selectedRoleId;
  }

  function clearAllTaxonomySelections() {
    return {
      appSurface: "",
      domain: "",
      role: ""
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

  function renderNodeCard(flow, node) {
    const related = isNodeRelated(node);
    const groups = getFeatureGroups(node);
    const surfaces = namesByIds(flow.appSurfaces || [], "appId", node.appSurfaceIds || []);
    const domains = namesByIds(flow.domains, "domainId", node.domainIds);
    const roles = namesByIds(flow.roles, "roleId", node.roleIds);
    const nodeOrigin = { kind: "node", nodeId: node.nodeId };
    const nodeOriginKey = endpointKey(nodeOrigin);
    const entryAppNames = getEntryAppSurfaceNames(flow, node);
    return `
      <article class="node-card ${selectedNodeId === node.nodeId ? "selected" : ""} ${related ? "" : "dimmed"}"
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
          <span>${escapeHtml(node.pageType)}</span>
          <button class="origin-dot outlet-dot card-outlet ${connectingFrom && endpointKey(connectingFrom) === nodeOriginKey ? "active" : ""}"
            data-origin-kind="node"
            data-origin-node-id="${escapeAttr(node.nodeId)}"
            data-origin-key="${escapeAttr(nodeOriginKey)}"
            title="卡片连线出口"
            aria-label="卡片连线出口"></button>
        </header>
        <p class="purpose">${escapeHtml(node.purpose)}</p>
        <dl class="meta-grid">
          <dt>业务域</dt><dd>${escapeHtml(domains || "未设置")}</dd>
          <dt>角色</dt><dd>${escapeHtml(roles || "未设置")}</dd>
        </dl>
        <div class="feature-groups">
          ${groups.map((group) => renderFeatureGroup(group, node.nodeId)).join("") || "<p class=\"empty compact\">暂无功能</p>"}
        </div>
      </article>
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
      <form class="details-form" id="nodeDetailsForm">
        <header class="inspector-head">
          <div>
            <h2>${escapeHtml(node.title)}</h2>
            <code>${escapeHtml(node.nodeId)}</code>
          </div>
          <div class="inspector-actions">
            ${renderIconButton("nodePrd", "创建当前页面 PRD", "file-text")}
            ${renderIconButton("nodePencil", "创建当前页面 Pencil", "pen-line")}
            ${renderIconButton("closeInspector", "关闭详情", "x")}
          </div>
        </header>
        <label>页面名称
          <input id="nodeTitle" value="${escapeAttr(node.title)}">
        </label>
        <label>页面类型
          <input id="nodePageType" value="${escapeAttr(node.pageType)}">
        </label>
        <label>页面目的
          <textarea id="nodePurpose" rows="4">${escapeHtml(node.purpose)}</textarea>
        </label>
        ${renderMultiSelect("nodeAppSurfaceIds", "应用端", flow.appSurfaces || [], "appId", "name", node.appSurfaceIds || [])}
        ${renderMultiSelect("nodeDomainIds", "业务域", flow.domains, "domainId", "name", node.domainIds || [])}
        ${renderMultiSelect("nodeRoleIds", "角色", flow.roles, "roleId", "name", node.roleIds || [])}
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

  function renderAppSurfaceInspector(flow, surface) {
    return `
      <form class="details-form" id="appSurfaceDetailsForm">
        <header class="inspector-head">
          <div>
            <h2 id="appSurfacePanelTitle">${escapeHtml(surface.name)}</h2>
            <code>${escapeHtml(surface.appId)}</code>
          </div>
          ${renderIconButton("closeInspector", "关闭详情", "x")}
        </header>
        <label>应用端名称
          <input id="appSurfaceName" value="${escapeAttr(surface.name)}">
        </label>
        <label>应用端类型
          <select id="appSurfaceType">
            ${["admin", "web", "app", "miniapp", "desktop", "other"].map((type) =>
              `<option value="${type}" ${surface.type === type ? "selected" : ""}>${type}</option>`
            ).join("")}
          </select>
        </label>
        <label>应用端介绍
          <textarea id="appSurfaceDescription" rows="4">${escapeHtml(surface.description || "")}</textarea>
        </label>
        ${renderMultiSelect("appSurfaceDomainIds", "关联业务域", flow.domains || [], "domainId", "name", surface.domainIds || [])}
        ${renderMultiSelect("appSurfaceRoleIds", "关联角色", flow.roles || [], "roleId", "name", surface.roleIds || [])}
        <p class="form-error" id="appSurfaceFormError"></p>
      </form>
    `;
  }

  function renderDomainInspector(domain) {
    return `
      <form class="details-form" id="domainDetailsForm">
        <header class="inspector-head">
          <div>
            <h2 id="domainPanelTitle">${escapeHtml(domain.name)}</h2>
            <code>${escapeHtml(domain.domainId)}</code>
          </div>
          ${renderIconButton("closeInspector", "关闭详情", "x")}
        </header>
        <label>业务域名称
          <input id="domainName" value="${escapeAttr(domain.name)}">
        </label>
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
            <h2 id="rolePanelTitle">${escapeHtml(role.name)}</h2>
            <code>${escapeHtml(role.roleId)}</code>
          </div>
          ${renderIconButton("closeInspector", "关闭详情", "x")}
        </header>
        <label>角色名称
          <input id="roleName" value="${escapeAttr(role.name)}">
        </label>
        <label>角色说明
          <textarea id="roleDescription" rows="4">${escapeHtml(role.description || "")}</textarea>
        </label>
        ${renderMultiSelect("roleDomainIds", "关联业务域", flow.domains || [], "domainId", "name", role.domainIds || [])}
        <p class="form-error" id="roleFormError"></p>
      </form>
    `;
  }

  function renderEdgeInspector(flow, edge) {
    const selectedType = normalizeEdgeTypeForSelect(edge.type);
    const triggerRule = edge.trigger || edge.action || "";
    return `
      <form class="details-form" id="edgeDetailsForm">
        <header class="inspector-head">
          <div>
            <h2 id="edgePanelTitle">${escapeHtml(triggerRule)}</h2>
            <code>${escapeHtml(edge.edgeId)}</code>
          </div>
          ${renderIconButton("closeInspector", "关闭详情", "x")}
        </header>
        <label>触发规则描述
          <input id="edgeTriggerRule" value="${escapeAttr(triggerRule)}" placeholder="输入连线触发规则">
        </label>
        ${renderEndpointPicker("edgeFromEndpoint", "起点", flow, edge.from || { kind: "node", nodeId: edge.fromNodeId }, true)}
        ${renderEndpointPicker("edgeToEndpoint", "终点", flow, edge.to || { kind: "node", nodeId: edge.toNodeId }, false)}
        <label>路径类型
          <select id="edgeType">
            ${EDGE_TYPE_OPTIONS.map((type) =>
              `<option value="${type.value}" ${selectedType === type.value ? "selected" : ""}>${type.label}</option>`
            ).join("")}
          </select>
        </label>
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
            ${appSurfaces.map((surface) => renderEndpointAppSurfaceOption(surface, selectedValue)).join("")}
            ${nodes.map((node) => renderEndpointNodeOptions(node, selectedValue, includeFeatureEndpoints)).join("")}
            </div>
          </div>
        </label>
      </div>
    `;
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
    const kindClass = endpoint.kind === "appSurface" ? "app-surface-option" : endpoint.kind === "node" ? "node-option" : endpoint.kind === "featureGroup" ? "group-option" : "item-option";
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
      <div class="feature-edit-item" data-group-index="${groupIndex}" data-item-index="${itemIndex}" data-item-id="${escapeAttr(item.itemId || makeClientId("item"))}">
        ${renderIconActionButton("drag-handle", "拖拽排序功能项", "grip-vertical", `data-drag-kind="item" data-group-index="${groupIndex}" data-item-index="${itemIndex}"`)}
        <input class="item-name" value="${escapeAttr(item.name || "")}" placeholder="功能项名称">
        <input class="item-type" value="${escapeAttr(item.type || "text")}" placeholder="类型">
        <input class="item-description" value="${escapeAttr(item.description || "")}" placeholder="说明">
        <label class="checkbox-label"><input class="item-required" type="checkbox" ${item.required ? "checked" : ""}> 必填</label>
        ${renderIconActionButton("delete-feature-item danger-text", "删除功能项", "trash-2", `data-group-index="${groupIndex}" data-item-index="${itemIndex}"`)}
      </div>
    `;
  }

  function bindEvents() {
    const canvas = document.getElementById("canvas");
    const edgeLayer = document.getElementById("edgeLayer");
    const nodeSearchInput = document.getElementById("nodeSearch");
    const closeInspectorButton = document.getElementById("closeInspector");

    bindAction("collapseLeftPanel", () => {
      leftPanelCollapsed = true;
      render();
    });
    bindAction("expandLeftPanel", () => {
      leftPanelCollapsed = false;
      render();
    });
    if (nodeSearchInput) {
      nodeSearchInput.addEventListener("input", (event) => {
        nodeSearch = event.target.value;
        render();
        requestAnimationFrame(() => {
          const nextInput = document.getElementById("nodeSearch");
          if (nextInput) {
            nextInput.focus({ preventScroll: true });
            nextInput.setSelectionRange(nodeSearch.length, nodeSearch.length);
          }
        });
      });
      nodeSearchInput.addEventListener("keydown", (event) => {
        event.stopPropagation();
      });
    }
    if (closeInspectorButton) {
      closeInspectorButton.addEventListener("click", clearSelection);
    }

    bindTaxonomyPanelToggles(document);
    bindTaxonomyControls(document);

    bindButton("generateFullPrd", { type: "generateFullPrd" });
    bindButton("floatingGenerateFullPrd", { type: "generateFullPrd" });
    bindButton("generateFullPencil", { type: "generateFullPencil" });
    bindButton("floatingGenerateFullPencil", { type: "generateFullPencil" });
    bindButton("nodePrd", selectedNodeId ? { type: "generateNodePrd", nodeId: selectedNodeId } : null);
    bindButton("nodePencil", selectedNodeId ? { type: "generateNodePencil", nodeId: selectedNodeId } : null);

    bindCanvasElements();

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("pointerdown", startPan);
    canvas.addEventListener("pointermove", movePan);
    canvas.addEventListener("pointerup", endPan);
    canvas.addEventListener("pointercancel", endPan);
    canvas.addEventListener("click", handleCanvasClick);
    document.oncontextmenu = handleContextMenu;
    document.onkeydown = handleKeyDown;

    edgeLayer.addEventListener("click", (event) => {
      const endpoint = event.target.closest(".edge-endpoint");
      if (endpoint) {
        event.stopPropagation();
        const edgeId = endpoint.dataset.edgeId;
        if (edgeId) {
          selectEdge(edgeId);
        }
        return;
      }
      const edgeTarget = event.target.closest("[data-edge-id]");
      if (edgeTarget) {
        event.stopPropagation();
        const edgeId = edgeTarget.dataset.edgeId;
        if (edgeId) {
          selectEdge(edgeId);
        }
      }
    });

    const nodeForm = document.getElementById("nodeDetailsForm");
    if (nodeForm) {
      bindNodeInspector(nodeForm);
    }
    const appSurfaceForm = document.getElementById("appSurfaceDetailsForm");
    if (appSurfaceForm) {
      bindAppSurfaceInspector(appSurfaceForm);
    }
    const domainForm = document.getElementById("domainDetailsForm");
    if (domainForm) {
      bindDomainInspector(domainForm);
    }
    const roleForm = document.getElementById("roleDetailsForm");
    if (roleForm) {
      bindRoleInspector(roleForm);
    }
    const edgeForm = document.getElementById("edgeDetailsForm");
    if (edgeForm) {
      bindEdgeInspector(edgeForm);
    }
  }

  function bindButton(id, message) {
    const button = document.getElementById(id);
    if (!button || !message) {
      return;
    }
    button.addEventListener("click", () => vscode.postMessage(message));
  }

  function bindAction(id, handler) {
    const button = document.getElementById(id);
    if (!button) {
      return;
    }
    button.addEventListener("click", handler);
  }

  function bindCanvasElements(root = document) {
    root.querySelectorAll(".node-list-item").forEach((button) => {
      button.addEventListener("click", () => {
        const nodeId = button.dataset.listNodeId;
        if (nodeId) {
          selectNode(nodeId, true);
        }
      });
    });

    root.querySelectorAll(".node-card").forEach((card) => {
      card.addEventListener("pointerdown", startNodeDrag);
      card.addEventListener("click", (event) => {
        if (event.target.closest("button, input, textarea, select")) {
          return;
        }
        const nodeId = card.dataset.nodeId;
        if (nodeId && !dragState) {
          selectNode(nodeId, false);
        }
      });
    });

    root.querySelectorAll(".app-surface-card").forEach((card) => {
      card.addEventListener("pointerdown", startAppSurfaceDrag);
      card.addEventListener("click", (event) => {
        if (event.target.closest("button, input, textarea, select")) {
          return;
        }
        const appId = card.dataset.appSurfaceId;
        if (appId && !dragState) {
          selectAppSurface(appId);
        }
      });
    });

    root.querySelectorAll(".origin-dot").forEach((button) => {
      button.addEventListener("pointerdown", (event) => startConnectionDrag(event, "from", endpointFromButton(button), button));
    });

    root.querySelectorAll(".target-dot").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        const endpoint = endpointFromTargetButton(button);
        if (endpoint) {
          startConnectionDrag(event, "to", endpoint, button);
        }
      });
    });
  }

  function bindTaxonomyPanelToggles(root = document) {
    root.querySelectorAll("[data-taxonomy-toggle]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const kind = button.dataset.taxonomyToggle;
        if (!kind) {
          return;
        }
        taxonomyPanelsOpen = {
          ...taxonomyPanelsOpen,
          [kind]: taxonomyPanelsOpen[kind] === false
        };
        persistUiState();
        render();
        requestAnimationFrame(() => focusCanvas());
      });
    });
  }

  function bindTaxonomyControls(root = document) {
    root.querySelectorAll(".taxonomy-filter-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        event.stopPropagation();
        setFilterSelection(checkbox.dataset.kind, checkbox.value, checkbox.checked);
        render();
      });
      checkbox.addEventListener("click", (event) => event.stopPropagation());
    });

    root.querySelectorAll(".managed-list-item").forEach((item) => {
      item.addEventListener("pointerdown", (event) => event.stopPropagation());
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        selectTaxonomyItem(item.dataset.kind, item.dataset.taxonomyId);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          selectTaxonomyItem(item.dataset.kind, item.dataset.taxonomyId);
        }
      });
    });

    root.querySelectorAll(".taxonomy-action").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        manageTaxonomy(button.dataset.kind, button.dataset.action);
      });
    });
  }

  function bindNodeInspector(nodeForm) {
    nodeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      commitNodeDetailsChange({ immediate: true });
    });
    nodeForm.addEventListener("input", (event) => {
      if (event.target.closest(".drag-handle")) {
        return;
      }
      commitNodeDetailsChange();
    });
    nodeForm.addEventListener("change", () => {
      commitNodeDetailsChange({ immediate: true });
    });
    bindFeatureEditor();
  }

  function bindAppSurfaceInspector(appSurfaceForm) {
    appSurfaceForm.addEventListener("submit", (event) => {
      event.preventDefault();
      commitAppSurfaceDetailsChange({ immediate: true });
    });
    appSurfaceForm.addEventListener("input", () => {
      commitAppSurfaceDetailsChange();
    });
    appSurfaceForm.addEventListener("change", () => {
      commitAppSurfaceDetailsChange({ immediate: true });
    });
  }

  function bindDomainInspector(domainForm) {
    domainForm.addEventListener("submit", (event) => {
      event.preventDefault();
      commitDomainDetailsChange({ immediate: true });
    });
    domainForm.addEventListener("input", () => {
      commitDomainDetailsChange();
    });
    domainForm.addEventListener("change", () => {
      commitDomainDetailsChange({ immediate: true });
    });
  }

  function bindRoleInspector(roleForm) {
    roleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      commitRoleDetailsChange({ immediate: true });
    });
    roleForm.addEventListener("input", () => {
      commitRoleDetailsChange();
    });
    roleForm.addEventListener("change", () => {
      commitRoleDetailsChange({ immediate: true });
    });
  }

  function setFilterSelection(kind, id, checked) {
    const list = getFilterSelection(kind);
    if (checked && !list.includes(id)) {
      list.push(id);
    } else if (!checked) {
      const index = list.indexOf(id);
      if (index >= 0) {
        list.splice(index, 1);
      }
    }
    normalizeFilters();
  }

  function getFilterSelection(kind) {
    if (kind === "appSurface") {
      return appFilters;
    }
    if (kind === "domain") {
      return domainFilters;
    }
    return roleFilters;
  }

  function selectTaxonomyItem(kind, id) {
    if (!kind || !id) {
      return;
    }
    if (kind === "appSurface") {
      selectAppSurface(id);
      return;
    }
    selectedNodeId = "";
    selectedEdgeId = "";
    selectedAppSurfaceId = "";
    if (kind === "domain") {
      selectedDomainId = id;
      selectedRoleId = "";
      taxonomySelection = {
        appSurface: "",
        domain: id,
        role: ""
      };
      vscode.postMessage({ type: "selectDomain", domainId: id });
    } else {
      selectedDomainId = "";
      selectedRoleId = id;
      taxonomySelection = {
        appSurface: "",
        domain: "",
        role: id
      };
      vscode.postMessage({ type: "selectRole", roleId: id });
    }
    persistUiState();
    render();
    requestAnimationFrame(() => focusCanvas());
  }

  function bindEdgeInspector(edgeForm) {
    edgeForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    edgeForm.addEventListener("change", (event) => {
      if (event.target.closest(".endpoint-combobox")) {
        return;
      }
      submitEdgeDetails();
    });
    edgeForm.addEventListener("input", (event) => {
      if (event.target.closest(".endpoint-combobox")) {
        filterEndpointOptions(event.target);
        return;
      }
      submitEdgeDetails();
    });
    edgeForm.querySelectorAll(".endpoint-combobox-input").forEach((input) => {
      input.addEventListener("focus", () => {
        input.select();
        openEndpointPicker(input, true);
      });
      input.addEventListener("click", () => openEndpointPicker(input, true));
      input.addEventListener("keydown", (event) => event.stopPropagation());
    });
    edgeForm.querySelectorAll(".endpoint-picker").forEach((picker) => {
      picker.addEventListener("focusout", () => {
        setTimeout(() => {
          if (!picker.contains(document.activeElement)) {
            closeEndpointPicker(picker);
          }
        }, 0);
      });
    });
    edgeForm.querySelectorAll(".endpoint-option").forEach((option) => {
      option.addEventListener("click", () => selectEndpointOption(option));
    });
  }

  function bindFeatureEditor() {
    const editor = document.getElementById("featureEditor");
    const addGroup = document.getElementById("addFeatureGroup");
    if (!editor || !addGroup) {
      return;
    }
    addGroup.addEventListener("click", () => {
      const groups = collectFeatureGroups();
      groups.push({
        groupId: makeClientId("group"),
        name: "新功能分组",
        type: "section",
        description: "",
        items: []
      });
      rerenderFeatureEditor(groups);
      commitNodeDetailsChange({ immediate: true });
    });
    editor.addEventListener("click", (event) => {
      const addItem = event.target.closest(".add-feature-item");
      const deleteGroup = event.target.closest(".delete-feature-group");
      const deleteItem = event.target.closest(".delete-feature-item");
      const groups = collectFeatureGroups();
      if (addItem) {
        const groupIndex = Number(addItem.dataset.groupIndex);
        groups[groupIndex]?.items.push({
          itemId: makeClientId("item"),
          name: "新功能项",
          type: "text",
          description: "",
          required: false
        });
        rerenderFeatureEditor(groups);
        commitNodeDetailsChange({ immediate: true });
      } else if (deleteGroup) {
        groups.splice(Number(deleteGroup.dataset.groupIndex), 1);
        rerenderFeatureEditor(groups);
        commitNodeDetailsChange({ immediate: true });
      } else if (deleteItem) {
        const group = groups[Number(deleteItem.dataset.groupIndex)];
        if (group) {
          group.items.splice(Number(deleteItem.dataset.itemIndex), 1);
          rerenderFeatureEditor(groups);
          commitNodeDetailsChange({ immediate: true });
        }
      }
    });
    editor.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest(".drag-handle");
      if (!handle) {
        return;
      }
      event.preventDefault();
      startFeatureSort(event, handle);
    });
  }

  function rerenderFeatureEditor(groups) {
    const editor = document.getElementById("featureEditor");
    if (!editor) {
      return;
    }
    editor.innerHTML = renderFeatureEditorGroups(groups);
  }

  function startFeatureSort(event, handle) {
    const kind = handle.dataset.dragKind;
    const row = kind === "group" ? handle.closest(".feature-edit-group") : handle.closest(".feature-edit-item");
    const container = kind === "group" ? document.getElementById("featureEditor") : row?.closest(".feature-edit-items");
    if (!row || !container) {
      return;
    }
    featureDrag = {
      kind,
      pointerId: event.pointerId,
      handle,
      row,
      container,
      startY: event.clientY,
      lastY: event.clientY
    };
    row.classList.add("sorting");
    container.classList.add("sorting-container");
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", moveFeatureSort);
    handle.addEventListener("pointerup", endFeatureSort);
    handle.addEventListener("pointercancel", cancelFeatureSort);
  }

  function moveFeatureSort(event) {
    if (!featureDrag || event.pointerId !== featureDrag.pointerId) {
      return;
    }
    event.preventDefault();
    const containerRect = featureDrag.container.getBoundingClientRect();
    const rowRect = featureDrag.row.getBoundingClientRect();
    const minY = containerRect.top + rowRect.height / 2;
    const maxY = containerRect.bottom - rowRect.height / 2;
    const pointerY = clamp(event.clientY, minY, maxY);
    const delta = pointerY - featureDrag.startY;
    featureDrag.row.style.transform = `translateY(${delta}px)`;
    featureDrag.lastY = pointerY;
    reorderFeatureSortRow(pointerY);
  }

  function reorderFeatureSortRow(pointerY) {
    if (!featureDrag) {
      return;
    }
    const selector = featureDrag.kind === "group" ? ".feature-edit-group" : ".feature-edit-item";
    const siblings = Array.from(featureDrag.container.querySelectorAll(`:scope > ${selector}`))
      .filter((item) => item !== featureDrag.row);
    const before = siblings.find((item) => {
      const rect = item.getBoundingClientRect();
      return pointerY < rect.top + rect.height / 2;
    }) || null;
    if (before !== featureDrag.row.nextElementSibling) {
      featureDrag.container.insertBefore(featureDrag.row, before);
      featureDrag.startY = pointerY;
      featureDrag.row.style.transform = "translateY(0)";
      refreshFeatureEditorIndices();
    }
  }

  function endFeatureSort(event) {
    if (!featureDrag || event.pointerId !== featureDrag.pointerId) {
      return;
    }
    finishFeatureSort();
    commitNodeDetailsChange({ immediate: true });
  }

  function cancelFeatureSort(event) {
    if (!featureDrag || event.pointerId !== featureDrag.pointerId) {
      return;
    }
    finishFeatureSort();
  }

  function finishFeatureSort() {
    const drag = featureDrag;
    if (!drag) {
      return;
    }
    drag.row.classList.remove("sorting");
    drag.row.style.transform = "";
    drag.container.classList.remove("sorting-container");
    drag.handle.removeEventListener("pointermove", moveFeatureSort);
    drag.handle.removeEventListener("pointerup", endFeatureSort);
    drag.handle.removeEventListener("pointercancel", cancelFeatureSort);
    try {
      drag.handle.releasePointerCapture(drag.pointerId);
    } catch {
      // Pointer capture can be released by the webview before pointerup.
    }
    featureDrag = null;
    refreshFeatureEditorIndices();
  }

  function refreshFeatureEditorIndices() {
    document.querySelectorAll(".feature-edit-group").forEach((groupEl, groupIndex) => {
      groupEl.dataset.groupIndex = String(groupIndex);
      groupEl.querySelector(".feature-edit-group-head")?.setAttribute("data-group-index", String(groupIndex));
      groupEl.querySelectorAll("[data-group-index]").forEach((element) => {
        element.dataset.groupIndex = String(groupIndex);
      });
      groupEl.querySelectorAll(".feature-edit-item").forEach((itemEl, itemIndex) => {
        itemEl.dataset.groupIndex = String(groupIndex);
        itemEl.dataset.itemIndex = String(itemIndex);
        itemEl.querySelectorAll("[data-group-index]").forEach((element) => {
          element.dataset.groupIndex = String(groupIndex);
        });
        itemEl.querySelectorAll("[data-item-index]").forEach((element) => {
          element.dataset.itemIndex = String(itemIndex);
        });
      });
    });
  }

  function collectFeatureGroups() {
    return Array.from(document.querySelectorAll(".feature-edit-group")).map((groupEl) => ({
      groupId: groupEl.dataset.groupId || makeClientId("group"),
      name: groupEl.querySelector(".group-name").value.trim() || "未命名分组",
      type: groupEl.querySelector(".group-type").value.trim() || "section",
      description: groupEl.querySelector(".group-description").value.trim(),
      items: Array.from(groupEl.querySelectorAll(".feature-edit-item")).map((itemEl) => ({
        itemId: itemEl.dataset.itemId || makeClientId("item"),
        name: itemEl.querySelector(".item-name").value.trim() || "未命名功能项",
        type: itemEl.querySelector(".item-type").value.trim() || "text",
        description: itemEl.querySelector(".item-description").value.trim(),
        required: Boolean(itemEl.querySelector(".item-required").checked)
      }))
    }));
  }

  function manageTaxonomy(kind, action) {
    const flow = state.flow;
    const currentId = action === "create" ? "" : taxonomySelection[kind] || "";
    const current = getTaxonomyItems(flow, kind).find((item) => getTaxonomyId(kind, item) === currentId);
    if (action !== "create" && !current) {
      window.alert("请先在列表中选中要编辑或删除的项目。");
      return;
    }
    if (action === "delete") {
      if (!window.confirm("确定删除当前项？相关节点和连线引用会同步移除。")) {
        return;
      }
      clearTaxonomySelection(kind, currentId);
      vscode.postMessage({ type: "updateTaxonomy", request: { kind, action, id: currentId } });
      return;
    }
    const item = promptTaxonomyItem(flow, kind, current);
    if (!item) {
      return;
    }
    vscode.postMessage({ type: "updateTaxonomy", request: { kind, action, id: current ? getTaxonomyId(kind, current) : undefined, item } });
  }

  function clearTaxonomySelection(kind, id) {
    taxonomySelection = {
      ...taxonomySelection,
      [kind]: ""
    };
    const list = getFilterSelection(kind);
    const index = list.indexOf(id);
    if (index >= 0) {
      list.splice(index, 1);
    }
    if (kind === "appSurface" && selectedAppSurfaceId === id) {
      selectedAppSurfaceId = "";
    }
    if (kind === "domain" && selectedDomainId === id) {
      selectedDomainId = "";
    }
    if (kind === "role" && selectedRoleId === id) {
      selectedRoleId = "";
    }
    persistUiState();
  }

  function promptTaxonomyItem(flow, kind, current) {
    if (kind === "appSurface") {
      const name = window.prompt("应用端名称", current?.name || "");
      if (!name) return null;
      return {
        appId: current?.appId,
        name,
        type: window.prompt("应用端类型：admin/web/app/miniapp/desktop/other", current?.type || "other") || "other",
        description: window.prompt("应用端说明", current?.description || "") || "",
        domainIds: splitIds(window.prompt("关联业务域 ID，逗号分隔", (current?.domainIds || []).join(", ")) || ""),
        roleIds: splitIds(window.prompt("关联角色 ID，逗号分隔", (current?.roleIds || []).join(", ")) || "")
      };
    }
    if (kind === "domain") {
      const name = window.prompt("业务域名称", current?.name || "");
      if (!name) return null;
      return {
        domainId: current?.domainId,
        name,
        description: window.prompt("业务域说明", current?.description || "") || ""
      };
    }
    const name = window.prompt("角色名称", current?.name || "");
    if (!name) return null;
    return {
      roleId: current?.roleId,
      name,
      description: window.prompt("角色说明", current?.description || "") || "",
      domainIds: splitIds(window.prompt("关联业务域 ID，逗号分隔", (current?.domainIds || []).join(", ")) || "")
    };
  }

  function seedNodePositions(flow) {
    flow.nodes.forEach((node, index) => {
      if (nodePositions.has(node.nodeId)) {
        return;
      }
      const saved = node.view && node.view.position;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        nodePositions.set(node.nodeId, { x: saved.x, y: saved.y });
        return;
      }
      nodePositions.set(node.nodeId, {
        x: (index % 4) * 380,
        y: Math.floor(index / 4) * 340
      });
    });
  }

  function seedAppSurfacePositions(flow) {
    (flow.appSurfaces || []).forEach((surface, index) => {
      if (appSurfacePositions.has(surface.appId)) {
        return;
      }
      const saved = surface.view && surface.view.position;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        appSurfacePositions.set(surface.appId, { x: saved.x, y: saved.y });
        return;
      }
      appSurfacePositions.set(surface.appId, appSurfaceSourcePosition(index));
    });
  }

  function positionCards() {
    document.querySelectorAll(".node-card").forEach((card) => {
      const nodeId = card.dataset.nodeId;
      const pos = nodePositions.get(nodeId);
      if (!pos) {
        return;
      }
      card.style.left = `${pos.x}px`;
      card.style.top = `${pos.y}px`;
    });
    document.querySelectorAll(".app-surface-card").forEach((card) => {
      const appId = card.dataset.appSurfaceId;
      const pos = appSurfacePositions.get(appId);
      if (!pos) {
        return;
      }
      card.style.left = `${pos.x}px`;
      card.style.top = `${pos.y}px`;
    });
  }

  function applyCamera() {
    const world = document.getElementById("world");
    const canvas = document.getElementById("canvas");
    const pill = document.querySelector(".zoom-pill");
    if (world) {
      world.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${zoom})`;
    }
    if (canvas) {
      const grid = Math.max(8, 32 * zoom);
      canvas.style.backgroundSize = `${grid}px ${grid}px`;
      canvas.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
    }
    if (pill) {
      pill.textContent = `${Math.round(zoom * 100)}%`;
    }
    persistUiState();
  }

  function handleWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.08 : 0.92;
      zoomAt(event.clientX, event.clientY, zoom * factor);
      return;
    }
    camera.x -= event.deltaX;
    camera.y -= event.deltaY;
    applyCamera();
    scheduleDrawEdges();
  }

  function zoomAt(clientX, clientY, nextZoom) {
    const canvas = document.getElementById("canvas");
    const rect = canvas.getBoundingClientRect();
    const before = screenToWorld(clientX, clientY);
    zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    camera.x = clientX - rect.left - before.x * zoom;
    camera.y = clientY - rect.top - before.y * zoom;
    applyCamera();
    scheduleDrawEdges();
  }

  function startConnectionDrag(event, direction, endpoint, button) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const start = elementCenterInCanvas(button);
    const current = pointerCanvasPoint(event);
    connectionDrag = {
      pointerId: event.pointerId,
      direction,
      endpoint,
      button,
      start,
      current,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false
    };
    button.setPointerCapture(event.pointerId);
    button.addEventListener("pointermove", moveConnectionDrag);
    button.addEventListener("pointerup", endConnectionDrag);
    button.addEventListener("pointercancel", cancelConnectionDrag);
    scheduleDrawEdges();
  }

  function moveConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - connectionDrag.startClientX;
    const dy = event.clientY - connectionDrag.startClientY;
    if (Math.hypot(dx, dy) > 4) {
      connectionDrag.moved = true;
    }
    connectionDrag.current = pointerCanvasPoint(event);
    updateConnectionDropTarget(event);
    scheduleDrawEdges();
  }

  function endConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const drag = connectionDrag;
    releaseConnectionCapture(event);
    connectionDrag = null;
    clearConnectionDropTarget();

    if (!drag.moved) {
      finishConnectionClick(drag);
      scheduleDrawEdges();
      return;
    }

    const releaseElement = document.elementFromPoint(event.clientX, event.clientY);
    if (drag.direction === "from") {
      const targetDot = releaseElement?.closest(".target-dot");
      const to = targetDot ? endpointFromTargetButton(targetDot) : null;
      if (to) {
        postCreateEdge(drag.endpoint, to);
      } else if (isBlankCanvasPoint(releaseElement)) {
        postCreateConnectedNode({ from: drag.endpoint }, event);
      }
    } else {
      const originDot = releaseElement?.closest(".origin-dot");
      if (originDot) {
        postCreateEdge(endpointFromButton(originDot), drag.endpoint);
      } else if (isBlankCanvasPoint(releaseElement)) {
        postCreateConnectedNode({ to: drag.endpoint }, event);
      }
    }
    scheduleDrawEdges();
  }

  function cancelConnectionDrag(event) {
    if (!connectionDrag || event.pointerId !== connectionDrag.pointerId) {
      return;
    }
    releaseConnectionCapture(event);
    connectionDrag = null;
    clearConnectionDropTarget();
    scheduleDrawEdges();
  }

  function releaseConnectionCapture(event) {
    const button = connectionDrag?.button;
    if (!button) {
      return;
    }
    button.removeEventListener("pointermove", moveConnectionDrag);
    button.removeEventListener("pointerup", endConnectionDrag);
    button.removeEventListener("pointercancel", cancelConnectionDrag);
    try {
      button.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be released by the webview before pointerup.
    }
  }

  function updateConnectionDropTarget(event) {
    if (!connectionDrag) {
      clearConnectionDropTarget();
      return;
    }
    setConnectionDropTarget(getConnectionDropTarget(event.clientX, event.clientY));
  }

  function getConnectionDropTarget(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) {
      return null;
    }
    if (connectionDrag.direction === "from") {
      return element.closest(".target-dot");
    }
    return element.closest(".origin-dot");
  }

  function setConnectionDropTarget(target) {
    if (connectionDropTarget === target) {
      return;
    }
    clearConnectionDropTarget();
    connectionDropTarget = target;
    if (connectionDropTarget) {
      connectionDropTarget.classList.add("drop-candidate");
    }
  }

  function clearConnectionDropTarget() {
    if (!connectionDropTarget) {
      return;
    }
    connectionDropTarget.classList.remove("drop-candidate");
    connectionDropTarget = null;
  }

  function finishConnectionClick(drag) {
    if (drag.direction === "from") {
      connectingFrom = drag.endpoint;
      persistUiState();
      render();
      return;
    }
    if (connectingFrom && drag.endpoint) {
      postCreateEdge(connectingFrom, drag.endpoint);
      persistUiState();
      return;
    }
    if (drag.endpoint.kind === "appSurface") {
      selectAppSurface(endpointEntityId(drag.endpoint));
      return;
    }
    if (drag.endpoint.nodeId) {
      selectNode(drag.endpoint.nodeId, false);
    }
  }

  function postCreateEdge(from, to) {
    if (!from || !to) {
      return;
    }
    vscode.postMessage({ type: "createEdge", from, to, trigger: "手动连接", edgeType: "navigate" });
  }

  function postCreateConnectedNode(link, event) {
    const point = screenToWorld(event.clientX, event.clientY);
    vscode.postMessage({
      type: "createConnectedNodeAt",
      request: {
        ...link,
        x: Math.round(point.x),
        y: Math.round(point.y),
        trigger: "手动连接",
        type: "navigate",
        appSurfaceIds: appFilters,
        domainIds: domainFilters,
        roleIds: roleFilters
      }
    });
  }

  function elementCenterInCanvas(element) {
    const rect = element.getBoundingClientRect();
    const canvasRect = document.getElementById("canvas").getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - canvasRect.left,
      y: rect.top + rect.height / 2 - canvasRect.top
    };
  }

  function pointerCanvasPoint(event) {
    const canvasRect = document.getElementById("canvas").getBoundingClientRect();
    return {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top
    };
  }

  function isBlankCanvasPoint(element) {
    const canvas = document.getElementById("canvas");
    return Boolean(
      element &&
      canvas?.contains(element) &&
      !element.closest(".node-card") &&
      !element.closest(".app-surface-card") &&
      !element.closest(".floating-left-actions, .floating-taxonomy-controls, .floating-taxonomy-panels") &&
      !element.closest("[data-edge-id]") &&
      !element.closest("button, input, textarea, select")
    );
  }

  function startPan(event) {
    if (
      connectionDrag ||
      (event.button !== 0 && event.button !== 1) ||
      event.target.closest(".node-card") ||
      event.target.closest(".app-surface-card") ||
      event.target.closest(".floating-left-actions, .floating-taxonomy-controls, .floating-taxonomy-panels") ||
      event.target.closest("button, input, textarea, select") ||
      event.target.closest("[data-edge-id]")
    ) {
      return;
    }
    const canvas = document.getElementById("canvas");
    panState = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cameraX: camera.x,
      cameraY: camera.y,
      moved: false
    };
    canvas.classList.add("panning");
    canvas.setPointerCapture(event.pointerId);
  }

  function movePan(event) {
    if (!panState || event.pointerId !== panState.pointerId) {
      return;
    }
    camera.x = panState.cameraX + event.clientX - panState.x;
    camera.y = panState.cameraY + event.clientY - panState.y;
    if (Math.abs(event.clientX - panState.x) > 2 || Math.abs(event.clientY - panState.y) > 2) {
      panState.moved = true;
    }
    applyCamera();
    scheduleDrawEdges();
  }

  function endPan(event) {
    if (!panState || event.pointerId !== panState.pointerId) {
      return;
    }
    const canvas = document.getElementById("canvas");
    suppressNextCanvasClick = Boolean(panState.moved);
    panState = null;
    canvas.classList.remove("panning");
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be released by the webview before pointerup.
    }
  }

  function startNodeDrag(event) {
    startCardDrag(event, "node");
  }

  function startAppSurfaceDrag(event) {
    startCardDrag(event, "appSurface");
  }

  function startCardDrag(event, kind) {
    if (event.button !== 0 || event.target.closest("button, input, textarea, select")) {
      return;
    }
    event.stopPropagation();
    const card = event.currentTarget;
    const id = kind === "appSurface" ? card.dataset.appSurfaceId : card.dataset.nodeId;
    const positions = kind === "appSurface" ? appSurfacePositions : nodePositions;
    const pos = positions.get(id);
    if (!id || !pos) {
      return;
    }
    selectedEdgeId = "";
    selectedDomainId = "";
    selectedRoleId = "";
    if (kind === "appSurface") {
      selectedNodeId = "";
      taxonomySelection = {
        appSurface: id,
        domain: "",
        role: ""
      };
    } else {
      selectedAppSurfaceId = "";
      taxonomySelection = clearAllTaxonomySelections();
    }
    dragState = {
      pointerId: event.pointerId,
      kind,
      id,
      card,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false
    };
    card.classList.add("dragging");
    card.setPointerCapture(event.pointerId);
    card.addEventListener("pointermove", moveCardDrag);
    card.addEventListener("pointerup", endCardDrag);
    card.addEventListener("pointercancel", endCardDrag);
  }

  function moveCardDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const dx = (event.clientX - dragState.startX) / zoom;
    const dy = (event.clientY - dragState.startY) / zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      dragState.moved = true;
    }
    const next = {
      x: Math.round(dragState.originX + dx),
      y: Math.round(dragState.originY + dy)
    };
    const positions = dragState.kind === "appSurface" ? appSurfacePositions : nodePositions;
    positions.set(dragState.id, next);
    dragState.card.style.left = `${next.x}px`;
    dragState.card.style.top = `${next.y}px`;
    scheduleDrawEdges();
  }

  function endCardDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const { kind, id, card, moved } = dragState;
    const positions = kind === "appSurface" ? appSurfacePositions : nodePositions;
    const pos = positions.get(id);
    card.classList.remove("dragging");
    card.removeEventListener("pointermove", moveCardDrag);
    card.removeEventListener("pointerup", endCardDrag);
    card.removeEventListener("pointercancel", endCardDrag);
    try {
      card.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be released by the webview before pointerup.
    }
    dragState = null;
    if (moved && pos) {
      selectedEdgeId = "";
      if (kind === "appSurface") {
        selectedAppSurfaceId = id;
        selectedNodeId = "";
        selectedDomainId = "";
        selectedRoleId = "";
        taxonomySelection = {
          appSurface: id,
          domain: "",
          role: ""
        };
        persistUiState();
        vscode.postMessage({ type: "saveAppSurfacePosition", appId: id, x: pos.x, y: pos.y });
        vscode.postMessage({ type: "selectAppSurface", appId: id });
      } else {
        selectedNodeId = id;
        selectedAppSurfaceId = "";
        selectedDomainId = "";
        selectedRoleId = "";
        taxonomySelection = clearAllTaxonomySelections();
        vscode.postMessage({ type: "saveNodePosition", nodeId: id, x: pos.x, y: pos.y });
        vscode.postMessage({ type: "selectNode", nodeId: id });
      }
      return;
    }
    if (kind === "appSurface") {
      selectAppSurface(id);
      return;
    }
    selectNode(id, false);
  }

  function handleContextMenu(event) {
    const canvas = document.getElementById("canvas");
    if (!canvas || !canvas.contains(event.target)) {
      return;
    }
    if (event.target.closest(".node-card") || event.target.closest(".app-surface-card") || event.target.closest("[data-edge-id]")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = screenToWorld(event.clientX, event.clientY);
    vscode.postMessage({
      type: "createNodeAt",
      x: Math.round(point.x),
      y: Math.round(point.y),
        appSurfaceIds: appFilters,
        domainIds: domainFilters,
        roleIds: roleFilters
    });
  }

  function handleCanvasClick(event) {
    if (suppressNextCanvasClick) {
      suppressNextCanvasClick = false;
      return;
    }
    if (
      event.target.closest(".node-card") ||
      event.target.closest(".app-surface-card") ||
      event.target.closest(".floating-left-actions, .floating-taxonomy-controls, .floating-taxonomy-panels") ||
      event.target.closest("[data-edge-id]") ||
      event.target.closest("button, input, textarea, select") ||
      connectionDrag
    ) {
      return;
    }
    clearSelection();
  }

  function clearSelection() {
    selectedNodeId = "";
    selectedEdgeId = "";
    selectedAppSurfaceId = "";
    selectedDomainId = "";
    selectedRoleId = "";
    taxonomySelection = clearAllTaxonomySelections();
    connectingFrom = null;
    vscode.postMessage({ type: "clearSelection" });
    render();
  }

  function handleKeyDown(event) {
    if (event.key !== "Delete" && event.key !== "Backspace") {
      return;
    }
    if (isEditingTarget(event.target)) {
      return;
    }
    if (selectedNodeId) {
      const node = state.flow.nodes.find((item) => item.nodeId === selectedNodeId);
      if (node && node.status !== "removed") {
        event.preventDefault();
        clearTimeout(nodeDetailsSaveTimer);
        nodeDetailsSaveTimer = null;
        const nodeId = selectedNodeId;
        selectedNodeId = "";
        selectedEdgeId = "";
        vscode.postMessage({ type: "deleteNode", nodeId, nodeTitle: node.title });
      }
      return;
    }
    if (selectedEdgeId) {
      event.preventDefault();
      clearTimeout(edgeDetailsSaveTimer);
      edgeDetailsSaveTimer = null;
      const edgeId = selectedEdgeId;
      selectedEdgeId = "";
      vscode.postMessage({ type: "removeEdge", edgeId });
      return;
    }
    if (selectedAppSurfaceId) {
      event.preventDefault();
      deleteSelectedTaxonomy("appSurface", selectedAppSurfaceId);
      return;
    }
    if (selectedDomainId) {
      event.preventDefault();
      deleteSelectedTaxonomy("domain", selectedDomainId);
      return;
    }
    if (selectedRoleId) {
      event.preventDefault();
      deleteSelectedTaxonomy("role", selectedRoleId);
    }
  }

  function deleteSelectedTaxonomy(kind, id) {
    if (!kind || !id) {
      return;
    }
    cancelPendingTaxonomyDetailsSave(kind);
    clearTaxonomySelection(kind, id);
    selectedNodeId = "";
    selectedEdgeId = "";
    selectedAppSurfaceId = "";
    selectedDomainId = "";
    selectedRoleId = "";
    connectingFrom = null;
    vscode.postMessage({ type: "updateTaxonomy", request: { kind, action: "delete", id } });
    render();
  }

  function cancelPendingTaxonomyDetailsSave(kind) {
    if (kind === "appSurface") {
      clearTimeout(appSurfaceDetailsSaveTimer);
      appSurfaceDetailsSaveTimer = null;
    } else if (kind === "domain") {
      clearTimeout(domainDetailsSaveTimer);
      domainDetailsSaveTimer = null;
    } else if (kind === "role") {
      clearTimeout(roleDetailsSaveTimer);
      roleDetailsSaveTimer = null;
    }
  }

  function isEditingTarget(target) {
    return Boolean(target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function submitNodeDetails(event) {
    event?.preventDefault();
    commitNodeDetailsChange({ immediate: true });
  }

  function commitNodeDetailsChange(options = {}) {
    if (!selectedNodeId) {
      return;
    }
    const nodeId = selectedNodeId;
    const patch = collectNodeDetailsPatch();
    applyNodeDetailsLocally(nodeId, patch);
    refreshCanvasAndNodeList();
    if (options.immediate) {
      postNodeDetails(nodeId, patch);
      return;
    }
    clearTimeout(nodeDetailsSaveTimer);
    nodeDetailsSaveTimer = setTimeout(() => postNodeDetails(nodeId, patch), 250);
  }

  function collectNodeDetailsPatch() {
    return {
      title: document.getElementById("nodeTitle").value,
      pageType: document.getElementById("nodePageType").value,
      purpose: document.getElementById("nodePurpose").value,
      appSurfaceIds: collectMultiSelect("nodeAppSurfaceIds"),
      domainIds: collectMultiSelect("nodeDomainIds"),
      roleIds: collectMultiSelect("nodeRoleIds"),
      featureGroups: collectFeatureGroups()
    };
  }

  function postNodeDetails(nodeId, patch) {
    clearTimeout(nodeDetailsSaveTimer);
    nodeDetailsSaveTimer = null;
    vscode.postMessage({
      type: "updateNodeDetails",
      nodeId,
      patch
    });
  }

  function commitAppSurfaceDetailsChange(options = {}) {
    if (!selectedAppSurfaceId) {
      return;
    }
    const appId = selectedAppSurfaceId;
    const item = collectAppSurfaceDetailsPatch();
    applyAppSurfaceDetailsLocally(appId, item);
    refreshAppSurfaceViews();
    if (options.immediate) {
      postAppSurfaceDetails(appId, item);
      return;
    }
    clearTimeout(appSurfaceDetailsSaveTimer);
    appSurfaceDetailsSaveTimer = setTimeout(() => postAppSurfaceDetails(appId, item), 250);
  }

  function collectAppSurfaceDetailsPatch() {
    return {
      appId: selectedAppSurfaceId,
      name: document.getElementById("appSurfaceName").value,
      type: document.getElementById("appSurfaceType").value,
      description: document.getElementById("appSurfaceDescription").value,
      domainIds: collectMultiSelect("appSurfaceDomainIds"),
      roleIds: collectMultiSelect("appSurfaceRoleIds")
    };
  }

  function postAppSurfaceDetails(appId, item) {
    clearTimeout(appSurfaceDetailsSaveTimer);
    appSurfaceDetailsSaveTimer = null;
    vscode.postMessage({
      type: "updateTaxonomy",
      request: {
        kind: "appSurface",
        action: "update",
        id: appId,
        item
      }
    });
  }

  function commitDomainDetailsChange(options = {}) {
    if (!selectedDomainId) {
      return;
    }
    const domainId = selectedDomainId;
    const item = collectDomainDetailsPatch();
    applyDomainDetailsLocally(domainId, item);
    refreshDomainViews();
    if (options.immediate) {
      postDomainDetails(domainId, item);
      return;
    }
    clearTimeout(domainDetailsSaveTimer);
    domainDetailsSaveTimer = setTimeout(() => postDomainDetails(domainId, item), 250);
  }

  function collectDomainDetailsPatch() {
    return {
      domainId: selectedDomainId,
      name: document.getElementById("domainName").value,
      description: document.getElementById("domainDescription").value
    };
  }

  function postDomainDetails(domainId, item) {
    clearTimeout(domainDetailsSaveTimer);
    domainDetailsSaveTimer = null;
    vscode.postMessage({
      type: "updateTaxonomy",
      request: {
        kind: "domain",
        action: "update",
        id: domainId,
        item
      }
    });
  }

  function applyDomainDetailsLocally(domainId, item) {
    const domain = (state.flow.domains || []).find((candidate) => candidate.domainId === domainId);
    if (!domain) {
      return;
    }
    domain.name = item.name.trim() || domain.name;
    domain.description = item.description.trim();
  }

  function refreshDomainViews() {
    const title = document.getElementById("domainPanelTitle");
    const domain = (state.flow.domains || []).find((candidate) => candidate.domainId === selectedDomainId);
    if (title && domain) {
      title.textContent = domain.name;
    }
    refreshTaxonomyPanels();
    refreshCanvasAndNodeList();
  }

  function commitRoleDetailsChange(options = {}) {
    if (!selectedRoleId) {
      return;
    }
    const roleId = selectedRoleId;
    const item = collectRoleDetailsPatch();
    applyRoleDetailsLocally(roleId, item);
    refreshRoleViews();
    if (options.immediate) {
      postRoleDetails(roleId, item);
      return;
    }
    clearTimeout(roleDetailsSaveTimer);
    roleDetailsSaveTimer = setTimeout(() => postRoleDetails(roleId, item), 250);
  }

  function collectRoleDetailsPatch() {
    return {
      roleId: selectedRoleId,
      name: document.getElementById("roleName").value,
      description: document.getElementById("roleDescription").value,
      domainIds: collectMultiSelect("roleDomainIds")
    };
  }

  function postRoleDetails(roleId, item) {
    clearTimeout(roleDetailsSaveTimer);
    roleDetailsSaveTimer = null;
    vscode.postMessage({
      type: "updateTaxonomy",
      request: {
        kind: "role",
        action: "update",
        id: roleId,
        item
      }
    });
  }

  function applyRoleDetailsLocally(roleId, item) {
    const role = (state.flow.roles || []).find((candidate) => candidate.roleId === roleId);
    if (!role) {
      return;
    }
    role.name = item.name.trim() || role.name;
    role.description = item.description.trim();
    role.domainIds = item.domainIds;
  }

  function refreshRoleViews() {
    const title = document.getElementById("rolePanelTitle");
    const role = (state.flow.roles || []).find((candidate) => candidate.roleId === selectedRoleId);
    if (title && role) {
      title.textContent = role.name;
    }
    refreshTaxonomyPanels();
    refreshCanvasAndNodeList();
  }

  function applyAppSurfaceDetailsLocally(appId, item) {
    const surface = (state.flow.appSurfaces || []).find((candidate) => candidate.appId === appId);
    if (!surface) {
      return;
    }
    surface.name = item.name.trim() || surface.name;
    surface.type = item.type || surface.type || "other";
    surface.description = item.description.trim();
    surface.domainIds = item.domainIds;
    surface.roleIds = item.roleIds;
  }

  function refreshAppSurfaceViews() {
    const title = document.getElementById("appSurfacePanelTitle");
    const surface = (state.flow.appSurfaces || []).find((candidate) => candidate.appId === selectedAppSurfaceId);
    if (title && surface) {
      title.textContent = surface.name;
    }
    refreshTaxonomyPanels();
    const world = document.getElementById("world");
    if (world) {
      seedAppSurfacePositions(state.flow);
      const activeNodes = state.flow.nodes.filter((node) => node.status !== "removed");
      world.innerHTML = `${renderAppSurfaceSourceCards(state.flow)}${activeNodes.map((node) => renderNodeCard(state.flow, node)).join("")}`;
      bindCanvasElements(world);
      positionCards();
      scheduleDrawEdges();
    }
  }

  function refreshTaxonomyPanels() {
    const panels = document.querySelector(".floating-taxonomy-panels");
    if (!panels) {
      return;
    }
    panels.innerHTML = `
      ${taxonomyPanelsOpen.appSurface === false ? "" : renderManagedList("appSurface", "应用端", state.flow.appSurfaces || [], "appId", "name", "description", appFilters)}
      ${taxonomyPanelsOpen.domain === false ? "" : renderManagedList("domain", "业务域", getAvailableDomains(state.flow), "domainId", "name", "description", domainFilters)}
      ${taxonomyPanelsOpen.role === false ? "" : renderManagedList("role", "角色", getAvailableRoles(state.flow), "roleId", "name", "description", roleFilters)}
    `;
    bindTaxonomyControls(panels);
  }

  function submitEdgeDetails(options = {}) {
    if (!selectedEdgeId) {
      return;
    }
    const edgeId = selectedEdgeId;
    const patch = collectEdgeDetailsPatch();
    const saveRevision = ++edgeDetailsSaveRevision;
    applyEdgeDetailsLocally(edgeId, patch);
    scheduleDrawEdges();
    if (options.immediate) {
      postEdgeDetails(edgeId, patch, saveRevision);
      return;
    }
    clearTimeout(edgeDetailsSaveTimer);
    edgeDetailsSaveTimer = setTimeout(() => {
      if (saveRevision === edgeDetailsSaveRevision) {
        postEdgeDetails(edgeId, patch, saveRevision);
      }
    }, 150);
  }

  function collectEdgeDetailsPatch() {
    return {
      trigger: document.getElementById("edgeTriggerRule").value,
      from: parseEndpointValue(document.getElementById("edgeFromEndpoint").dataset.endpointValue),
      to: parseEndpointValue(document.getElementById("edgeToEndpoint").dataset.endpointValue),
      type: document.getElementById("edgeType").value,
      condition: document.getElementById("edgeCondition").value,
      appSurfaceIds: collectTagMultiSelect("edgeAppSurfaceIds"),
      domainIds: collectTagMultiSelect("edgeDomainIds"),
      roleIds: collectTagMultiSelect("edgeRoleIds")
    };
  }

  function postEdgeDetails(edgeId, patch, revision) {
    clearTimeout(edgeDetailsSaveTimer);
    edgeDetailsSaveTimer = null;
    rememberPendingEdgeDetailsSave(edgeId, patch, revision);
    vscode.postMessage({
      type: "updateEdgeDetails",
      edgeId,
      revision,
      patch
    });
  }

  function applyNodeDetailsLocally(nodeId, patch) {
    const node = state.flow.nodes.find((item) => item.nodeId === nodeId);
    if (!node) {
      return;
    }
    node.title = patch.title;
    node.pageType = patch.pageType;
    node.purpose = patch.purpose;
    node.appSurfaceIds = patch.appSurfaceIds;
    node.domainIds = patch.domainIds;
    node.roleIds = patch.roleIds;
    node.featureGroups = patch.featureGroups;
  }

  function applyEdgeDetailsLocally(edgeId, patch) {
    const edge = state.flow.edges.find((item) => item.edgeId === edgeId);
    if (!edge) {
      return;
    }
    edge.from = patch.from;
    edge.to = patch.to;
    edge.fromNodeId = endpointEntityId(patch.from);
    edge.toNodeId = endpointEntityId(patch.to);
    edge.trigger = patch.trigger.trim();
    edge.action = edge.trigger;
    edge.type = patch.type;
    edge.condition = patch.condition.trim() || undefined;
    edge.appSurfaceIds = patch.appSurfaceIds;
    edge.domainIds = patch.domainIds;
    edge.roleIds = patch.roleIds;
    const title = document.getElementById("edgePanelTitle");
    if (title) {
      title.textContent = edge.trigger;
    }
  }

  function rememberPendingEdgeDetailsSave(edgeId, patch, revision) {
    if (!isUsableEdgeDetailsPatch(patch)) {
      return;
    }
    pendingEdgeDetailsSaves = pendingEdgeDetailsSaves.filter((entry) => entry.edgeId !== edgeId);
    pendingEdgeDetailsSaves.push({
      edgeId,
      revision,
      savedAt: Date.now(),
      patch
    });
    persistUiState();
  }

  function reconcilePendingEdgeDetailsSaves() {
    const now = Date.now();
    pendingEdgeDetailsSaves = pendingEdgeDetailsSaves.filter((entry) => {
      const edge = state.flow.edges.find((item) => item.edgeId === entry.edgeId);
      if (!edge || now - entry.savedAt > PENDING_EDGE_DETAILS_TTL_MS) {
        return false;
      }
      if (edgeDetailsPatchMatches(edge, entry.patch)) {
        return false;
      }
      applyEdgeDetailsLocally(entry.edgeId, entry.patch);
      return true;
    });
  }

  function readPendingEdgeDetailsSaves(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const now = Date.now();
    return value.filter((entry) =>
      entry &&
      typeof entry.edgeId === "string" &&
      isUsableEdgeDetailsPatch(entry.patch) &&
      Number.isFinite(Number(entry.savedAt)) &&
      now - Number(entry.savedAt) <= PENDING_EDGE_DETAILS_TTL_MS
    ).map((entry) => ({
      edgeId: entry.edgeId,
      revision: Number(entry.revision) || 0,
      savedAt: Number(entry.savedAt),
      patch: entry.patch
    }));
  }

  function isUsableEdgeDetailsPatch(patch) {
    return Boolean(
      patch &&
      patch.from &&
      patch.to &&
      typeof patch.from.kind === "string" &&
      typeof patch.from.nodeId === "string" &&
      typeof patch.to.kind === "string" &&
      typeof patch.to.nodeId === "string" &&
      typeof patch.trigger === "string" &&
      typeof patch.type === "string" &&
      typeof patch.condition === "string"
    );
  }

  function edgeDetailsPatchMatches(edge, patch) {
    const from = edge.from || { kind: "node", nodeId: edge.fromNodeId };
    const to = edge.to || { kind: "node", nodeId: edge.toNodeId };
    return endpointKey(from) === endpointKey(patch.from) &&
      endpointKey(to) === endpointKey(patch.to) &&
      String(edge.trigger || edge.action || "") === String(patch.trigger || "").trim() &&
      normalizeEdgeTypeForSelect(edge.type) === normalizeEdgeTypeForSelect(patch.type) &&
      String(edge.condition || "") === String(patch.condition || "").trim() &&
      sameStringSet(edge.appSurfaceIds || [], patch.appSurfaceIds || []) &&
      sameStringSet(edge.domainIds || [], patch.domainIds || []) &&
      sameStringSet(edge.roleIds || [], patch.roleIds || []);
  }

  function sameStringSet(left, right) {
    const leftValues = [...new Set((left || []).filter(Boolean))].sort();
    const rightValues = [...new Set((right || []).filter(Boolean))].sort();
    return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
  }

  function refreshCanvasAndNodeList() {
    const flow = state.flow;
    seedNodePositions(flow);
    seedAppSurfacePositions(flow);
    normalizeFilters();
    const activeNodes = flow.nodes.filter((node) => node.status !== "removed");
    const visibleListNodes = activeNodes.filter((node) => matchesNodeSearch(flow, node, nodeSearch));
    const world = document.getElementById("world");
    const nodeList = document.querySelector(".node-list");
    if (world) {
      world.innerHTML = `${renderAppSurfaceSourceCards(flow)}${activeNodes.map((node) => renderNodeCard(flow, node)).join("")}`;
    }
    if (nodeList) {
      nodeList.innerHTML = visibleListNodes.map((node) => renderNodeListItem(flow, node)).join("") || "<p class=\"empty\">无匹配节点</p>";
    }
    if (world || nodeList) {
      bindCanvasElements(world || document);
      if (nodeList) {
        bindCanvasElements(nodeList);
      }
      positionCards();
      scheduleDrawEdges();
    }
  }

  function selectNode(nodeId, center) {
    selectedNodeId = nodeId;
    selectedEdgeId = "";
    selectedAppSurfaceId = "";
    selectedDomainId = "";
    selectedRoleId = "";
    taxonomySelection = clearAllTaxonomySelections();
    vscode.postMessage({ type: "selectNode", nodeId });
    render();
    requestAnimationFrame(() => {
      focusCanvas();
      if (center) {
        centerNode(nodeId);
      }
    });
  }

  function selectEdge(edgeId) {
    selectedEdgeId = edgeId;
    selectedNodeId = "";
    selectedAppSurfaceId = "";
    selectedDomainId = "";
    selectedRoleId = "";
    taxonomySelection = clearAllTaxonomySelections();
    vscode.postMessage({ type: "selectEdge", edgeId });
    render();
    requestAnimationFrame(() => focusCanvas());
  }

  function selectAppSurface(appId) {
    selectedAppSurfaceId = appId;
    selectedNodeId = "";
    selectedEdgeId = "";
    selectedDomainId = "";
    selectedRoleId = "";
    taxonomySelection = {
      appSurface: appId,
      domain: "",
      role: ""
    };
    persistUiState();
    vscode.postMessage({ type: "selectAppSurface", appId });
    render();
    requestAnimationFrame(() => focusCanvas());
  }

  function focusCanvas() {
    document.getElementById("canvas")?.focus({ preventScroll: true });
  }

  function centerNode(nodeId) {
    const canvas = document.getElementById("canvas");
    const card = document.querySelector(`.node-card[data-node-id="${cssEscape(nodeId)}"]`);
    const pos = nodePositions.get(nodeId);
    if (!canvas || !card || !pos) {
      return;
    }
    camera.x = canvas.clientWidth / 2 - (pos.x + card.offsetWidth / 2) * zoom;
    camera.y = canvas.clientHeight / 2 - (pos.y + card.offsetHeight / 2) * zoom;
    applyCamera();
    scheduleDrawEdges();
  }

  function scheduleDrawEdges() {
    if (framePending) {
      return;
    }
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      drawEdges();
    });
  }

  function drawEdges() {
    const svg = document.getElementById("edgeLayer");
    const canvas = document.getElementById("canvas");
    if (!svg || !canvas) {
      return;
    }
    svg.setAttribute("width", String(canvas.clientWidth));
    svg.setAttribute("height", String(canvas.clientHeight));
    const edgesHtml = state.flow.edges
      .filter((edge) => edge.status === "active")
      .map((edge) => renderEdge(edge))
      .join("");
    svg.innerHTML = `${edgesHtml}${renderConnectionPreview()}`;
  }

  function getAppSurfaceEntryNodes(flow, appId) {
    return flow.nodes.filter((node) =>
      node.status !== "removed" &&
      nodeBelongsToAppSurface(node, appId) &&
      isAppSurfaceEntryNode(flow, node, appId)
    );
  }

  function isAppSurfaceEntryNode(flow, node, appId) {
    return !flow.edges.some((edge) => {
      if (edge.status !== "active" || edge.toNodeId !== node.nodeId) {
        return false;
      }
      const fromNode = flow.nodes.find((candidate) => candidate.nodeId === edge.fromNodeId);
      return fromNode ? nodeBelongsToAppSurface(fromNode, appId) : false;
    });
  }

  function nodeBelongsToAppSurface(node, appId) {
    return !Array.isArray(node.appSurfaceIds) || node.appSurfaceIds.length === 0 || node.appSurfaceIds.includes(appId);
  }

  function renderEdge(edge) {
    const fromEndpoint = edge.from || { kind: "node", nodeId: edge.fromNodeId };
    const toEndpoint = edge.to || { kind: "node", nodeId: edge.toNodeId };
    const from = getEndpointScreenPoint(fromEndpoint, "from");
    const to = getEndpointScreenPoint(toEndpoint, "to") || getEndpointScreenPoint({ kind: "node", nodeId: edge.toNodeId }, "to");
    if (!from || !to) {
      return "";
    }
    const active = isEdgeRelated(edge) && from.related && to.related;
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const curve = Math.max(80, Math.abs(to.x - from.x) * 0.45);
    const d = `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
    return `
      <g class="edge edge-type-${edgeTypeGroup(edge.type)} ${active ? "" : "dimmed"} ${selectedEdgeId === edge.edgeId ? "selected" : ""}">
        <path class="edge-hitarea" data-edge-id="${escapeAttr(edge.edgeId)}" d="${d}"></path>
        <path class="edge-path" data-edge-id="${escapeAttr(edge.edgeId)}" d="${d}"></path>
        <circle class="edge-endpoint outlet-end" data-edge-id="${escapeAttr(edge.edgeId)}" data-edge-end="from" cx="${from.x}" cy="${from.y}" r="5"></circle>
        <circle class="edge-endpoint inlet-end" data-edge-id="${escapeAttr(edge.edgeId)}" data-edge-end="to" cx="${to.x}" cy="${to.y}" r="5"></circle>
        <text class="edge-label" data-edge-id="${escapeAttr(edge.edgeId)}" x="${midX}" y="${midY - 8}">${escapeHtml(edge.trigger || edge.action)}</text>
      </g>
    `;
  }

  function renderConnectionPreview() {
    if (!connectionDrag) {
      return "";
    }
    const from = connectionDrag.direction === "from" ? connectionDrag.start : connectionDrag.current;
    const to = connectionDrag.direction === "from" ? connectionDrag.current : connectionDrag.start;
    const curve = Math.max(60, Math.abs(to.x - from.x) * 0.45);
    const d = `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
    return `
      <g class="connection-preview">
        <path class="connection-preview-path" d="${d}"></path>
        <circle class="connection-preview-end" cx="${to.x}" cy="${to.y}" r="5"></circle>
      </g>
    `;
  }

  function getEndpointScreenPoint(endpoint, direction) {
    const key = endpointKey(endpoint);
    let element = document.querySelector(`[data-origin-key="${cssEscape(key)}"]`);
    if (direction === "to") {
      element = document.querySelector(`.target-dot[data-target-key="${cssEscape(key)}"]`) ||
        document.querySelector(`.target-dot[data-target-node-id="${cssEscape(endpoint.nodeId || "")}"]`) ||
        element;
    }
    if (element) {
      const rect = element.getBoundingClientRect();
      const canvasRect = document.getElementById("canvas").getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - canvasRect.left,
        y: rect.top + rect.height / 2 - canvasRect.top,
        related: !element.closest(".node-card, .app-surface-card")?.classList.contains("dimmed")
      };
    }
    if (endpoint.kind === "appSurface") {
      const appId = endpointEntityId(endpoint);
      const surface = (state.flow.appSurfaces || []).find((item) => item.appId === appId);
      const pos = appSurfacePositions.get(appId);
      if (!surface || !pos) {
        return null;
      }
      return {
        ...worldToScreen({ x: pos.x + CARD_WIDTH / 2, y: pos.y + 70 }),
        related: isAppSurfaceRelated(surface)
      };
    }
    const node = state.flow.nodes.find((item) => item.nodeId === endpoint.nodeId);
    const pos = node ? nodePositions.get(node.nodeId) : null;
    if (!node || !pos) {
      return null;
    }
    return {
      ...worldToScreen({ x: pos.x + CARD_WIDTH / 2, y: pos.y + CARD_MIN_HEIGHT / 2 }),
      related: isNodeRelated(node)
    };
  }

  function screenToWorld(clientX, clientY) {
    const rect = document.getElementById("canvas").getBoundingClientRect();
    return {
      x: (clientX - rect.left - camera.x) / zoom,
      y: (clientY - rect.top - camera.y) / zoom
    };
  }

  function worldToScreen(point) {
    return {
      x: point.x * zoom + camera.x,
      y: point.y * zoom + camera.y
    };
  }

  function endpointFromButton(button) {
    if (button.dataset.originKind === "appSurface") {
      const appId = button.dataset.originAppId || button.dataset.originNodeId;
      return { kind: "appSurface", nodeId: appId, appId };
    }
    const endpoint = {
      kind: button.dataset.originKind,
      nodeId: button.dataset.originNodeId
    };
    if (button.dataset.originGroupId) {
      endpoint.groupId = button.dataset.originGroupId;
    }
    if (button.dataset.originItemId) {
      endpoint.itemId = button.dataset.originItemId;
    }
    return endpoint;
  }

  function endpointFromTargetButton(button) {
    if (button.dataset.targetKind === "appSurface") {
      const appId = button.dataset.targetAppId || button.dataset.targetNodeId;
      return appId ? { kind: "appSurface", nodeId: appId, appId } : null;
    }
    const nodeId = button.dataset.targetNodeId;
    return nodeId ? { kind: "node", nodeId } : null;
  }

  function endpointKey(endpoint) {
    return `${endpoint.kind}:${endpointEntityId(endpoint)}:${endpoint.groupId || ""}:${endpoint.itemId || ""}`;
  }

  function encodeEndpoint(endpoint) {
    return [endpoint.kind, endpointEntityId(endpoint), endpoint.groupId || "", endpoint.itemId || ""]
      .map((part) => encodeURIComponent(part))
      .join("|");
  }

  function parseEndpointValue(value) {
    const [kind, entityId, groupId, itemId] = String(value || "")
      .split("|")
      .map((part) => decodeURIComponent(part || ""));
    const endpoint = kind === "appSurface"
      ? { kind, nodeId: entityId, appId: entityId }
      : { kind, nodeId: entityId };
    if (groupId) {
      endpoint.groupId = groupId;
    }
    if (itemId) {
      endpoint.itemId = itemId;
    }
    return endpoint;
  }

  function endpointDisplayLabel(flow, endpoint) {
    if (endpoint.kind === "appSurface") {
      const appId = endpointEntityId(endpoint);
      const surface = (flow.appSurfaces || []).find((item) => item.appId === appId);
      return `应用端卡片 · ${surface?.name || appId || ""}`;
    }
    const node = flow.nodes.find((item) => item.nodeId === endpoint.nodeId);
    if (!node) {
      return endpoint.nodeId || "";
    }
    if (endpoint.kind === "node") {
      return `节点卡片 · ${node.title}`;
    }
    const group = getFeatureGroups(node).find((item) => item.groupId === endpoint.groupId);
    if (endpoint.kind === "featureGroup") {
      return `功能分组 · ${group?.name || endpoint.groupId || ""}`;
    }
    const item = group?.items?.find((candidate) => candidate.itemId === endpoint.itemId);
    return `功能项 · ${item?.name || endpoint.itemId || ""}`;
  }

  function endpointEntityId(endpoint) {
    return endpoint.kind === "appSurface" ? endpoint.appId || endpoint.nodeId || "" : endpoint.nodeId || "";
  }

  function endpointSearchText(parts) {
    return parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function filterEndpointOptions(input) {
    const picker = input.closest(".endpoint-picker");
    if (!picker) {
      return;
    }
    openEndpointPicker(input);
  }

  function openEndpointPicker(input, showAll = false) {
    const picker = input.closest(".endpoint-picker");
    const menu = picker?.querySelector(".endpoint-menu");
    if (!picker || !menu) {
      return;
    }
    document.querySelectorAll(".endpoint-picker.open").forEach((item) => {
      if (item !== picker) {
        closeEndpointPicker(item);
      }
    });
    picker.classList.add("open");
    input.setAttribute("aria-expanded", "true");
    filterEndpointOptionsWithoutReopen(picker, showAll ? "" : input.value);
  }

  function filterEndpointOptionsWithoutReopen(picker, value) {
    const query = String(value || "").trim().toLowerCase();
    picker.querySelectorAll(".endpoint-menu > .endpoint-option").forEach((option) => {
      option.hidden = !endpointOptionMatches(option, query);
    });
    picker.querySelectorAll(".endpoint-cascade-node").forEach((nodeElement) => {
      const nodeButton = nodeElement.querySelector(":scope > .endpoint-option");
      const nodeMatches = endpointOptionMatches(nodeButton, query);
      let hasVisibleGroup = false;

      nodeElement.querySelectorAll(":scope > .endpoint-cascade-children > .endpoint-cascade-group").forEach((groupElement) => {
        const groupButton = groupElement.querySelector(":scope > .endpoint-option");
        const groupMatches = endpointOptionMatches(groupButton, query);
        let hasVisibleItem = false;

        groupElement.querySelectorAll(":scope > .endpoint-cascade-children > .endpoint-option").forEach((itemButton) => {
          const itemVisible = !query || nodeMatches || groupMatches || endpointOptionMatches(itemButton, query);
          itemButton.hidden = !itemVisible;
          hasVisibleItem = hasVisibleItem || itemVisible;
        });

        const groupVisible = !query || nodeMatches || groupMatches || hasVisibleItem;
        groupElement.hidden = !groupVisible;
        if (groupButton) {
          groupButton.hidden = !groupVisible;
        }
        hasVisibleGroup = hasVisibleGroup || groupVisible;
      });

      const nodeVisible = !query || nodeMatches || hasVisibleGroup;
      nodeElement.hidden = !nodeVisible;
      if (nodeButton) {
        nodeButton.hidden = !nodeVisible;
      }
    });
  }

  function endpointOptionMatches(option, query) {
    if (!query || !option) {
      return !query;
    }
    return `${option.dataset.search || ""} ${option.textContent || ""}`.toLowerCase().includes(query);
  }

  function closeEndpointPicker(picker) {
    const input = picker.querySelector(".endpoint-combobox-input");
    picker.classList.remove("open");
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.value = input.dataset.endpointLabel || input.value;
      filterEndpointOptionsWithoutReopen(picker, "");
    }
  }

  function selectEndpointOption(option) {
    const picker = option.closest(".endpoint-picker");
    const input = picker?.querySelector(".endpoint-combobox-input");
    if (!picker || !input) {
      return;
    }
    input.dataset.endpointValue = option.dataset.endpointValue || "";
    input.dataset.endpointLabel = option.dataset.endpointLabel || option.textContent || "";
    input.value = input.dataset.endpointLabel;
    picker.querySelectorAll(".endpoint-option.selected").forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-selected", "false");
    });
    option.classList.add("selected");
    option.setAttribute("aria-selected", "true");
    closeEndpointPicker(picker);
    submitEdgeDetails({ immediate: true });
  }

  function normalizeEdgeTypeForSelect(type) {
    const group = edgeTypeGroup(type);
    if (group === "auto") return "autoNavigate";
    if (group === "data") return "dataFlow";
    return "interaction";
  }

  function edgeTypeGroup(type) {
    if (type === "autoNavigate" || type === "navigate" || type === "branch") {
      return "auto";
    }
    if (type === "dataFlow" || type === "system") {
      return "data";
    }
    return "interaction";
  }

  function getFeatureGroups(node) {
    if (Array.isArray(node.featureGroups) && node.featureGroups.length > 0) {
      return node.featureGroups;
    }
    if (!Array.isArray(node.elements) || node.elements.length === 0) {
      return [];
    }
    return [
      {
        groupId: `group_legacy_${node.nodeId}`,
        name: "页面元素",
        type: "legacyElements",
        description: "由页面元素字段兼容展示。",
        items: node.elements.map((element) => ({
          itemId: `item_legacy_${element.elementId}`,
          name: element.name,
          type: element.type,
          description: element.description,
          dataBinding: element.dataBinding,
          required: element.required
        }))
      }
    ];
  }

  function getAvailableDomains(flow) {
    if (appFilters.length === 0) {
      return flow.domains;
    }
    const selectedSurfaces = (flow.appSurfaces || []).filter((item) => appFilters.includes(item.appId));
    const domainIds = new Set(selectedSurfaces.flatMap((surface) => surface.domainIds || []));
    return domainIds.size > 0 ? flow.domains.filter((domain) => domainIds.has(domain.domainId)) : flow.domains;
  }

  function getAvailableRoles(flow) {
    const selectedSurfaces = appFilters.length > 0
      ? (flow.appSurfaces || []).filter((item) => appFilters.includes(item.appId))
      : [];
    const appRoleIds = new Set(selectedSurfaces.flatMap((surface) => surface.roleIds || []));
    return flow.roles.filter((role) => {
      const appOk = appFilters.length === 0 || appRoleIds.size === 0 || appRoleIds.has(role.roleId);
      const domainOk = domainFilters.length === 0 || intersects(role.domainIds || [], domainFilters);
      return appOk && domainOk;
    });
  }

  function normalizeFilters() {
    const flow = state.flow;
    appFilters = appFilters.filter((id) => (flow.appSurfaces || []).some((surface) => surface.appId === id));
    domainFilters = domainFilters.filter((id) => getAvailableDomains(flow).some((domain) => domain.domainId === id));
    roleFilters = roleFilters.filter((id) => getAvailableRoles(flow).some((role) => role.roleId === id));
    taxonomySelection = {
      appSurface: normalizeTaxonomySelection(flow, "appSurface", taxonomySelection.appSurface),
      domain: normalizeTaxonomySelection(flow, "domain", taxonomySelection.domain),
      role: normalizeTaxonomySelection(flow, "role", taxonomySelection.role)
    };
    if (selectedAppSurfaceId && !(flow.appSurfaces || []).some((surface) => surface.appId === selectedAppSurfaceId)) {
      selectedAppSurfaceId = "";
    }
    if (selectedDomainId && !(flow.domains || []).some((domain) => domain.domainId === selectedDomainId)) {
      selectedDomainId = "";
    }
    if (selectedRoleId && !(flow.roles || []).some((role) => role.roleId === selectedRoleId)) {
      selectedRoleId = "";
    }
  }

  function isNodeRelated(node) {
    const appOk = appFilters.length === 0 || !Array.isArray(node.appSurfaceIds) || node.appSurfaceIds.length === 0 || intersects(node.appSurfaceIds, appFilters);
    const domainOk = domainFilters.length === 0 || intersects(node.domainIds || [], domainFilters);
    const roleOk = roleFilters.length === 0 || intersects(node.roleIds || [], roleFilters);
    return appOk && domainOk && roleOk;
  }

  function isEdgeRelated(edge) {
    const fromEndpoint = edge.from || { kind: "node", nodeId: edge.fromNodeId };
    const toEndpoint = edge.to || { kind: "node", nodeId: edge.toNodeId };
    const endpointAppIds = [...endpointAppSurfaceIds(fromEndpoint), ...endpointAppSurfaceIds(toEndpoint)];
    const endpointDomainIds = [...endpointDomainSelectionIds(fromEndpoint), ...endpointDomainSelectionIds(toEndpoint)];
    const endpointRoleIds = [...endpointRoleSelectionIds(fromEndpoint), ...endpointRoleSelectionIds(toEndpoint)];
    const appOk = appFilters.length === 0 || intersects(edge.appSurfaceIds || [], appFilters) || intersects(endpointAppIds, appFilters);
    const domainOk = domainFilters.length === 0 || intersects(edge.domainIds || [], domainFilters) || intersects(endpointDomainIds, domainFilters);
    const roleOk = roleFilters.length === 0 || intersects(edge.roleIds || [], roleFilters) || intersects(endpointRoleIds, roleFilters);
    return appOk && domainOk && roleOk;
  }

  function getEntryAppSurfaceNames(flow, node) {
    const entryIds = getEntryAppSurfaceIds(flow, node);
    if (entryIds.length === 0) {
      return "";
    }
    const surfaces = flow.appSurfaces || [];
    return entryIds
      .map((appId) => surfaces.find((surface) => surface.appId === appId)?.name || appId || "全部应用端")
      .join(" / ");
  }

  function getEntryAppSurfaceIds(flow, node) {
    const nodeAppIds = Array.isArray(node.appSurfaceIds) && node.appSurfaceIds.length > 0 ? node.appSurfaceIds : [""];
    return nodeAppIds.filter((appId) => {
      return !flow.edges.some((edge) => {
        if (edge.status !== "active" || edge.toNodeId !== node.nodeId) {
          return false;
        }
        if (edge.from?.kind === "appSurface") {
          const edgeAppId = endpointEntityId(edge.from);
          return !appId || edgeAppId === appId;
        }
        if (!appId) {
          return true;
        }
        const fromNode = flow.nodes.find((item) => item.nodeId === edge.fromNodeId);
        return Array.isArray(fromNode?.appSurfaceIds) && fromNode.appSurfaceIds.includes(appId);
      });
    });
  }

  function isNodeRelatedByApp(node) {
    return appFilters.length === 0 || !Array.isArray(node.appSurfaceIds) || node.appSurfaceIds.length === 0 || intersects(node.appSurfaceIds, appFilters);
  }

  function endpointNode(endpoint) {
    return endpoint.kind === "appSurface" ? null : state.flow.nodes.find((node) => node.nodeId === endpoint.nodeId);
  }

  function endpointAppSurface(endpoint) {
    return endpoint.kind === "appSurface"
      ? (state.flow.appSurfaces || []).find((surface) => surface.appId === endpointEntityId(endpoint))
      : null;
  }

  function endpointAppSurfaceIds(endpoint) {
    const surface = endpointAppSurface(endpoint);
    if (surface) {
      return [surface.appId];
    }
    const node = endpointNode(endpoint);
    return node?.appSurfaceIds || [];
  }

  function endpointDomainSelectionIds(endpoint) {
    const surface = endpointAppSurface(endpoint);
    if (surface) {
      return surface.domainIds || [];
    }
    const node = endpointNode(endpoint);
    return node?.domainIds || [];
  }

  function endpointRoleSelectionIds(endpoint) {
    const surface = endpointAppSurface(endpoint);
    if (surface) {
      return surface.roleIds || [];
    }
    const node = endpointNode(endpoint);
    return node?.roleIds || [];
  }

  function isAppSurfaceRelated(surface) {
    const appOk = appFilters.length === 0 || appFilters.includes(surface.appId);
    const domainOk = domainFilters.length === 0 || intersects(surface.domainIds || [], domainFilters);
    const roleOk = roleFilters.length === 0 || intersects(surface.roleIds || [], roleFilters);
    return appOk && domainOk && roleOk;
  }

  function normalizeTaxonomySelection(flow, kind, id) {
    return id && getTaxonomyItems(flow, kind).some((item) => getTaxonomyId(kind, item) === id) ? id : "";
  }

  function intersects(left, right) {
    const rightSet = new Set(right || []);
    return (left || []).some((value) => rightSet.has(value));
  }

  function getTaxonomyItems(flow, kind) {
    if (kind === "appSurface") return flow.appSurfaces || [];
    if (kind === "domain") return flow.domains || [];
    return flow.roles || [];
  }

  function getTaxonomyId(kind, item) {
    if (kind === "appSurface") return item.appId;
    if (kind === "domain") return item.domainId;
    return item.roleId;
  }

  function namesByIds(items, idKey, ids) {
    return ids
      .map((id) => items.find((item) => item[idKey] === id)?.name || id)
      .filter(Boolean)
      .join(" / ");
  }

  function collectMultiSelect(id) {
    const select = document.getElementById(id);
    return Array.from(select?.selectedOptions || []).map((option) => option.value);
  }

  function collectTagMultiSelect(id) {
    return Array.from(document.querySelectorAll(`#${cssEscape(id)} input[type="checkbox"]:checked`))
      .map((input) => input.value);
  }

  function splitIds(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function readIdSelection(value, legacyValue) {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())));
    }
    return typeof legacyValue === "string" && legacyValue.trim() ? [legacyValue.trim()] : [];
  }

  function readTaxonomySelection(value) {
    return {
      appSurface: typeof value?.appSurface === "string" ? value.appSurface : "",
      domain: typeof value?.domain === "string" ? value.domain : "",
      role: typeof value?.role === "string" ? value.role : ""
    };
  }

  function readTaxonomyPanelsOpen(value) {
    return {
      appSurface: value?.appSurface !== false,
      domain: value?.domain !== false,
      role: value?.role !== false
    };
  }

  function makeClientId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function persistUiState() {
    vscode.setState({
      appFilters,
      domainFilters,
      roleFilters,
      taxonomySelection,
      taxonomyPanelsOpen,
      selectedAppSurfaceId,
      selectedDomainId,
      selectedRoleId,
      nodeSearch,
      leftPanelCollapsed,
      zoom,
      camera,
      connectingFrom,
      pendingEdgeDetailsSaves
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  reconcilePendingEdgeDetailsSaves();
  render();
})();
