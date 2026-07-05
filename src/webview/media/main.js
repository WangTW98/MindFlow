(function () {
  const vscode = acquireVsCodeApi();
  const state = window.__MINDFLOW_STATE__;
  const app = document.getElementById("app");
  const persisted = vscode.getState() || {};

  const CARD_WIDTH = 300;
  const CARD_MIN_HEIGHT = 230;
  const CARD_DRAG_THRESHOLD_PX = 4;
  const CARD_CLICK_SUPPRESS_MS = 100;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 2.6;
  const EDGE_TYPE_OPTIONS = [
    {
      value: "interaction",
      group: "interaction",
      label: "交互触发",
      color: "var(--vscode-charts-blue, #3794ff)",
      description: "用户通过执行操作(如鼠标点击、屏幕触控等行为)主动触发的跳转行为；"
    },
    {
      value: "autoNavigate",
      group: "auto",
      label: "自动跳转",
      color: "var(--vscode-charts-green, #89d185)",
      description: "应用/系统自动执行的跳转行为(如后台计算完成、支付完成等)；"
    },
    {
      value: "dataFlow",
      group: "data",
      label: "数据流转",
      color: "var(--vscode-charts-purple, #b180d7)",
      description: "当用户主动触发或系统自动触发某些条件时，控制数据同步(如后台发布文章，APP端进行查看)；"
    },
    {
      value: "statusChange",
      group: "status",
      label: "状态变更",
      color: "var(--vscode-charts-pink, #f472b6)",
      description: "用户主动或系统自动触发，但跳转或执行目标仅在相同状态组内执行(用于状态变更);"
    }
  ];
  const PAGE_TYPE_OPTIONS = [
    { value: "page", label: "页面", icon: "file-text" },
    { value: "popup", label: "弹窗", icon: "panel-top" }
  ];
  const APP_SURFACE_TYPE_OPTIONS = [
    { value: "admin", label: "管理后台", icon: "shield-check" },
    { value: "web", label: "Web 端", icon: "globe" },
    { value: "app", label: "App 端", icon: "smartphone" },
    { value: "miniapp", label: "小程序", icon: "scan-line" },
    { value: "desktop", label: "桌面端", icon: "monitor" },
    { value: "other", label: "其他端", icon: "monitor-smartphone" }
  ];
  const PENDING_EDGE_DETAILS_TTL_MS = 15000;
  const APP_SURFACE_SOURCE_X = -360;
  const APP_SURFACE_SOURCE_Y = 0;
  const APP_SURFACE_SOURCE_GAP = 240;
  const PRODUCT_ISSUE_SEVERITIES = [
    { value: "critical", label: "严重", icon: "octagon-alert" },
    { value: "warning", label: "警告", icon: "triangle-alert" },
    { value: "optional", label: "可选", icon: "circle-help" }
  ];

  let selectedNodeIds = readIdSelection(persisted.selectedNodeIds, state.selectedNodeId || persisted.selectedNodeId);
  let selectedNodeId = selectedNodeIds.includes(persisted.selectedNodeId)
    ? persisted.selectedNodeId
    : selectedNodeIds.includes(state.selectedNodeId)
      ? state.selectedNodeId
      : selectedNodeIds[0] || state.selectedNodeId || persisted.selectedNodeId || "";
  if (selectedNodeIds.length === 0 && selectedNodeId) {
    selectedNodeIds = [selectedNodeId];
  } else if (selectedNodeId && !selectedNodeIds.includes(selectedNodeId)) {
    selectedNodeId = selectedNodeIds[0] || "";
  }
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
  let taxonomyPanelsOpen = readTaxonomyPanelsOpen();
  let nodeSearch = persisted.nodeSearch || "";
  let nodeSearchComposing = false;
  let leftPanelCollapsed = Boolean(persisted.leftPanelCollapsed);
  let productIssuesPanelOpen = Boolean(persisted.productIssuesPanelOpen);
  let activeProductIssueSeverity = normalizeProductIssueSeverity(persisted.activeProductIssueSeverity) || "critical";
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
  let suppressNextNodeCardClick = false;
  let featureDrag = null;
  let nodeDetailsSaveTimer = null;
  let appSurfaceDetailsSaveTimer = null;
  let domainDetailsSaveTimer = null;
  let roleDetailsSaveTimer = null;
  let edgeDetailsSaveTimer = null;
  let edgeDetailsSaveRevision = 0;
  let pendingEdgeDetailsSaves = readPendingEdgeDetailsSaves(persisted.pendingEdgeDetailsSaves);
  let inspectorScrollState = readInspectorScrollState(persisted.inspectorScrollState);
  let framePending = false;
  let toastTimer = null;
  const nodePositions = new Map();
  const appSurfacePositions = new Map();

  function render() {
    const flow = state.flow;
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
    const visibleListNodes = activeNodes.filter((node) => matchesNodeSearch(flow, node, nodeSearch));
    const productIssues = getProductDesignIssues(flow);
    const productIssueCounts = countProductIssues(productIssues);

    app.innerHTML = `
      <main class="app-shell ${leftPanelCollapsed ? "left-collapsed" : ""} ${selectedNode || selectedEdge || selectedAppSurface || selectedDomain || selectedRole ? "" : "inspector-collapsed"} ${productIssuesPanelOpen ? "product-issues-open" : ""}">
        <aside class="left-panel">
          <section class="node-sidebar">
            <header class="nodes-toolbar">
              <div class="nodes-toolbar-title">
                <h2>节点</h2>
                <small>${visibleListNodes.length}/${activeNodes.length}</small>
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
            ${renderAppSurfaceSourceCards(flow)}
            ${activeNodes.map((node) => renderNodeCard(flow, node)).join("")}
          </div>
          <div class="zoom-pill">${Math.round(zoom * 100)}%</div>
        </section>

        <aside class="inspector">
          ${selectedAppSurface ? renderAppSurfaceInspector(flow, selectedAppSurface) : selectedDomain ? renderDomainInspector(selectedDomain) : selectedRole ? renderRoleInspector(flow, selectedRole) : selectedEdge ? renderEdgeInspector(flow, selectedEdge) : selectedNode ? renderNodeInspector(flow, selectedNode) : ""}
        </aside>

        ${renderProductIssueFab(productIssueCounts)}
        ${productIssuesPanelOpen ? renderProductIssuesPanel(productIssues, productIssueCounts) : ""}
      </main>
    `;

    bindEvents();
    restoreInspectorScroll();
    positionCards();
    applyCamera();
    persistUiState();
    scheduleDrawEdges();
  }

  function renderNodeListItem(flow, node) {
    const related = isNodeRelated(node);
    return `
      <button class="node-list-item ${isNodeSelected(node.nodeId) ? "selected" : ""} ${related ? "" : "dimmed"}"
        data-list-node-id="${escapeAttr(node.nodeId)}"
        aria-pressed="${isNodeSelected(node.nodeId) ? "true" : "false"}">
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
      <p class="save-hint">画布修改会写入 VSCode 文档缓冲区，使用文件保存落盘。</p>
    `;
  }

  function renderFloatingTaxonomyControls() {
    const panelButtonId = leftPanelCollapsed ? "expandLeftPanel" : "collapseLeftPanel";
    const panelButtonLabel = leftPanelCollapsed ? "展开左侧栏" : "收起左侧栏";
    const panelButtonIcon = leftPanelCollapsed ? "panel-left-open" : "panel-left-close";
    return `
      <div class="floating-taxonomy-controls" aria-label="应用端、业务域、角色面板">
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
      <div class="floating-taxonomy-panels" aria-label="应用端、业务域、角色列表">
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

  function renderProductIssueFab(counts) {
    return `
      <div class="product-issue-fab" aria-label="产品设计问题">
        ${PRODUCT_ISSUE_SEVERITIES.map((item) => {
          const count = counts[item.value] || 0;
          const active = productIssuesPanelOpen && activeProductIssueSeverity === item.value;
          return `
            <button type="button"
              class="icon-button product-issue-button product-issue-button-${escapeAttr(item.value)} ${active ? "active" : ""}"
              data-product-issue-toggle="${escapeAttr(item.value)}"
              title="${escapeAttr(item.label)}"
              aria-label="${escapeAttr(`${item.label} ${count} 条`)}"
              aria-pressed="${active ? "true" : "false"}">
              ${renderLucideIcon(item.icon)}
              ${count > 0 ? `<span class="product-issue-badge">${count}</span>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderProductIssuesPanel(issues, counts) {
    const activeSeverity = normalizeProductIssueSeverity(activeProductIssueSeverity) || "critical";
    const activeMeta = PRODUCT_ISSUE_SEVERITIES.find((item) => item.value === activeSeverity) || PRODUCT_ISSUE_SEVERITIES[0];
    const visibleIssues = issues.filter((issue) => issue.severity === activeSeverity);
    return `
      <section class="product-issue-panel" aria-label="产品设计问题列表">
        <header class="product-issue-panel-head">
          <div class="product-issue-title">
            ${renderLucideIcon(activeMeta.icon)}
            <strong>${escapeHtml(activeMeta.label)}问题</strong>
            <span>${visibleIssues.length} 条</span>
          </div>
          <div class="product-issue-panel-actions">
            <div class="product-issue-tabs" role="tablist" aria-label="问题等级">
              ${PRODUCT_ISSUE_SEVERITIES.map((item) => `
                <button type="button"
                  class="product-issue-tab ${activeSeverity === item.value ? "active" : ""}"
                  data-product-issue-tab="${escapeAttr(item.value)}"
                  role="tab"
                  aria-selected="${activeSeverity === item.value ? "true" : "false"}">
                  ${escapeHtml(item.label)}
                  <span>${counts[item.value] || 0}</span>
                </button>
              `).join("")}
            </div>
            ${renderIconButton("closeProductIssuePanel", "关闭问题列表", "x", "product-issue-close")}
          </div>
        </header>
        <div class="product-issue-list" role="tabpanel">
          ${visibleIssues.map((issue) => renderProductIssueRow(issue)).join("") || "<p class=\"empty product-issue-empty\">暂无该等级问题</p>"}
        </div>
      </section>
    `;
  }

  function renderProductIssueRow(issue) {
    return `
      <article class="product-issue-row">
        <div class="product-issue-row-copy">
          <h4>${escapeHtml(issue.title)}</h4>
          <p>${escapeHtml(issue.description)}</p>
        </div>
        <button type="button"
          class="icon-button product-issue-copy"
          data-product-issue-copy="${escapeAttr(issue.issueId)}"
          title="复制处理提示词"
          aria-label="复制处理提示词">
          ${renderLucideIcon("copy")}
        </button>
      </article>
    `;
  }

  function renderLucideIcon(name) {
    const icons = {
      "panel-left-close": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m16 15-3-3 3-3"></path>',
      "panel-left-open": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path><path d="m14 9 3 3-3 3"></path>',
      copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
      "circle-help": '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4"></path><path d="M12 17h.01"></path>',
      "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path>',
      globe: '<circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path>',
      "globe-2": '<path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"></path><path d="M7 3.34V5a3 3 0 0 0 3 3 2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"></path><path d="M11 21.95V18a2 2 0 0 0-2-2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"></path><circle cx="12" cy="12" r="10"></circle>',
      "grip-vertical": '<circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle>',
      monitor: '<rect width="20" height="14" x="2" y="3" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path>',
      "monitor-smartphone": '<path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"></path><path d="M10 19v-4"></path><path d="M7 19h5"></path><rect width="6" height="10" x="16" y="12" rx="2"></rect>',
      network: '<rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path>',
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
                ${renderTaxonomyActionButton(kind, "delete", `删除 ${item[labelKey]}`, "trash-2", false, "danger managed-list-row-action", `data-taxonomy-id="${escapeAttr(itemId)}"`)}
              </div>
            `;
          }).join("") || "<p class=\"empty compact\">暂无数据</p>"}
        </div>
      </section>
    `;
  }

  function renderStatusGroupList(groups) {
    return `
      <section class="managed-list taxonomy-panel status-group-panel" data-kind="statusGroup" data-taxonomy-panel="statusGroup">
        <header class="managed-list-head">
          <h4>状态组</h4>
          <div class="tiny-actions">
            ${renderTaxonomyActionButton("statusGroup", "create", "新增状态组", "plus")}
          </div>
        </header>
        <div class="managed-list-body status-group-list" role="list" aria-label="状态组列表">
          ${groups.map((group) => `
            <div class="status-group-list-item" role="listitem">
              <span class="status-group-color-square" data-status-group-color="${escapeAttr(normalizeStatusGroupColor(group.color))}" aria-hidden="true"></span>
              <strong title="${escapeAttr(group.title)}">${escapeHtml(group.title)}</strong>
              ${renderTaxonomyActionButton("statusGroup", "delete", `删除 ${group.title}`, "trash-2", false, "danger managed-list-row-action", `data-taxonomy-id="${escapeAttr(group.statusGroupId)}"`)}
            </div>
          `).join("") || "<p class=\"empty compact\">暂无状态组</p>"}
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
      return "";
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
      nodeSearchInput.addEventListener("compositionstart", () => {
        nodeSearchComposing = true;
      });
      nodeSearchInput.addEventListener("compositionend", (event) => {
        nodeSearchComposing = false;
        nodeSearch = event.target.value;
        persistUiState();
        renderAfterNodeSearchInput();
      });
      nodeSearchInput.addEventListener("input", (event) => {
        nodeSearch = event.target.value;
        persistUiState();
        if (nodeSearchComposing || event.isComposing) {
          return;
        }
        renderAfterNodeSearchInput();
      });
      nodeSearchInput.addEventListener("keydown", (event) => {
        event.stopPropagation();
      });
    }
    if (closeInspectorButton) {
      closeInspectorButton.addEventListener("click", clearSelection);
    }
    const inspector = document.querySelector(".inspector");
    if (inspector) {
      inspector.addEventListener("scroll", persistCurrentInspectorScroll, { passive: true });
    }

    bindTaxonomyPanelToggles(document);
    bindTaxonomyControls(document);
    bindProductIssueControls(document);
    applyEdgeTypeColorSwatches(document);
    applyStatusGroupColorSwatches(document);

    bindAction("closeProductIssuePanel", () => {
      productIssuesPanelOpen = false;
      persistUiState();
      render();
    });

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

  function bindAction(id, handler) {
    const button = document.getElementById(id);
    if (!button) {
      return;
    }
    button.addEventListener("click", handler);
  }

  function renderAfterNodeSearchInput() {
    render();
    requestAnimationFrame(() => {
      const nextInput = document.getElementById("nodeSearch");
      if (nextInput) {
        nextInput.focus({ preventScroll: true });
        nextInput.setSelectionRange(nodeSearch.length, nodeSearch.length);
      }
    });
  }

  function bindInlineTitleEditor(titleId, inputId, commit) {
    const title = document.getElementById(titleId);
    const input = document.getElementById(inputId);
    if (!title || !input) {
      return;
    }
    title.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startInlineTitleEdit(title, input, commit);
    });
    title.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (title.dataset.inlineEditing === "true") {
        return;
      }
      if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault();
        startInlineTitleEdit(title, input, commit);
      }
    });
  }

  function startInlineTitleEdit(title, input, commit) {
    if (title.dataset.inlineEditing === "true") {
      return;
    }
    const original = normalizeInlineTitleText(input.value || title.textContent);
    let finished = false;
    title.dataset.inlineEditing = "true";
    title.setAttribute("contenteditable", "true");
    title.setAttribute("role", "textbox");
    title.classList.add("editing");
    title.textContent = original;

    const finish = (save) => {
      if (finished) {
        return;
      }
      finished = true;
      title.removeEventListener("blur", handleBlur);
      title.removeEventListener("keydown", handleKeydown);
      const next = save ? normalizeInlineTitleText(title.textContent) || original : original;
      input.value = next;
      title.textContent = next;
      title.removeAttribute("contenteditable");
      title.removeAttribute("role");
      title.classList.remove("editing");
      delete title.dataset.inlineEditing;
      if (save && next !== original) {
        commit();
      }
    };

    const handleBlur = () => finish(true);
    const handleKeydown = (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
        title.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        title.blur();
      }
    };

    title.addEventListener("blur", handleBlur);
    title.addEventListener("keydown", handleKeydown);
    requestAnimationFrame(() => {
      title.focus({ preventScroll: true });
      selectInlineTitleText(title);
    });
  }

  function normalizeInlineTitleText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function selectInlineTitleText(element) {
    const selection = window.getSelection?.();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function bindProductIssueControls(root = document) {
    root.querySelectorAll("[data-product-issue-toggle]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const severity = normalizeProductIssueSeverity(button.dataset.productIssueToggle);
        if (!severity) {
          return;
        }
        if (productIssuesPanelOpen && activeProductIssueSeverity === severity) {
          productIssuesPanelOpen = false;
        } else {
          activeProductIssueSeverity = severity;
          productIssuesPanelOpen = true;
        }
        persistUiState();
        render();
      });
    });

    root.querySelectorAll("[data-product-issue-tab]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const severity = normalizeProductIssueSeverity(button.dataset.productIssueTab);
        if (!severity) {
          return;
        }
        activeProductIssueSeverity = severity;
        productIssuesPanelOpen = true;
        persistUiState();
        render();
      });
    });

    root.querySelectorAll("[data-product-issue-copy]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const issue = getProductDesignIssues(state.flow).find((item) => item.issueId === button.dataset.productIssueCopy);
        if (!issue) {
          showToast("未找到处理提示词");
          return;
        }
        await copyText(issue.prompt);
        showToast("已复制处理提示词");
      });
    });
  }

  function bindCanvasElements(root = document) {
    root.querySelectorAll(".node-list-item").forEach((button) => {
      button.addEventListener("click", (event) => {
        const nodeId = button.dataset.listNodeId;
        if (nodeId) {
          const multi = isNodeMultiSelectEvent(event);
          if (multi) {
            event.preventDefault();
          }
          selectNode(nodeId, true, { multi });
        }
      });
    });

    root.querySelectorAll(".node-card").forEach((card) => {
      card.addEventListener("pointerdown", startNodeDrag);
      card.addEventListener("click", (event) => {
        if (suppressNextNodeCardClick) {
          suppressNextNodeCardClick = false;
          suppressNextCanvasClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.target.closest("button, input, textarea, select")) {
          return;
        }
        const nodeId = card.dataset.nodeId;
        if (nodeId && !dragState) {
          const multi = isNodeMultiSelectEvent(event);
          if (multi) {
            event.preventDefault();
          }
          selectNode(nodeId, false, { multi });
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
          [kind]: taxonomyPanelsOpen[kind] !== true
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
        manageTaxonomy(button.dataset.kind, button.dataset.action, button.dataset.taxonomyId);
      });
    });
  }

  function bindNodeInspector(nodeForm) {
    bindInlineTitleEditor("nodePanelTitle", "nodeTitle", () => commitNodeDetailsChange({ immediate: true }));
    nodeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      commitNodeDetailsChange({ immediate: true });
    });
    nodeForm.addEventListener("input", (event) => {
      if (event.target.closest(".drag-handle, .inline-title-editor")) {
        return;
      }
      commitNodeDetailsChange();
    });
    nodeForm.addEventListener("change", (event) => {
      if (event.target.closest(".inline-title-editor")) {
        return;
      }
      commitNodeDetailsChange({ immediate: true });
    });
    nodeForm.querySelectorAll(".page-type-trigger").forEach((trigger) => {
      trigger.addEventListener("click", () => togglePageTypePicker(trigger));
      trigger.addEventListener("keydown", (event) => event.stopPropagation());
    });
    nodeForm.querySelectorAll(".page-type-picker").forEach((picker) => {
      picker.addEventListener("focusout", () => {
        setTimeout(() => {
          if (!picker.contains(document.activeElement)) {
            closePageTypePicker(picker);
          }
        }, 0);
      });
    });
    nodeForm.querySelectorAll(".page-type-option").forEach((option) => {
      option.addEventListener("click", () => selectPageTypeOption(option));
    });
    nodeForm.querySelectorAll(".status-group-trigger").forEach((trigger) => {
      trigger.addEventListener("click", () => toggleStatusGroupPicker(trigger));
      trigger.addEventListener("keydown", (event) => event.stopPropagation());
    });
    nodeForm.querySelectorAll(".status-group-picker").forEach((picker) => {
      picker.addEventListener("focusout", () => {
        setTimeout(() => {
          if (!picker.contains(document.activeElement)) {
            closeStatusGroupPicker(picker);
          }
        }, 0);
      });
    });
    nodeForm.querySelectorAll(".status-group-option").forEach((option) => {
      option.addEventListener("click", () => selectStatusGroupOption(option));
    });
    bindFeatureEditor();
  }

  function bindAppSurfaceInspector(appSurfaceForm) {
    bindInlineTitleEditor("appSurfacePanelTitle", "appSurfaceName", () => commitAppSurfaceDetailsChange({ immediate: true }));
    appSurfaceForm.addEventListener("submit", (event) => {
      event.preventDefault();
      commitAppSurfaceDetailsChange({ immediate: true });
    });
    appSurfaceForm.addEventListener("input", (event) => {
      if (event.target.closest(".inline-title-editor")) {
        return;
      }
      commitAppSurfaceDetailsChange();
    });
    appSurfaceForm.addEventListener("change", (event) => {
      if (event.target.closest(".inline-title-editor")) {
        return;
      }
      commitAppSurfaceDetailsChange({ immediate: true });
    });
    appSurfaceForm.querySelectorAll(".app-surface-type-trigger").forEach((trigger) => {
      trigger.addEventListener("click", () => toggleAppSurfaceTypePicker(trigger));
      trigger.addEventListener("keydown", (event) => event.stopPropagation());
    });
    appSurfaceForm.querySelectorAll(".app-surface-type-picker").forEach((picker) => {
      picker.addEventListener("focusout", () => {
        setTimeout(() => {
          if (!picker.contains(document.activeElement)) {
            closeAppSurfaceTypePicker(picker);
          }
        }, 0);
      });
    });
    appSurfaceForm.querySelectorAll(".app-surface-type-option").forEach((option) => {
      option.addEventListener("click", () => selectAppSurfaceTypeOption(option));
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
    if (kind === "statusGroup") {
      return [];
    }
    return roleFilters;
  }

  function selectTaxonomyItem(kind, id) {
    if (!kind || !id) {
      return;
    }
    if (kind === "statusGroup") {
      return;
    }
    if (kind === "appSurface") {
      selectAppSurface(id);
      return;
    }
    clearNodeSelectionState();
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
    bindInlineTitleEditor("edgePanelTitle", "edgeTriggerRule", () => submitEdgeDetails({ immediate: true }));
    edgeForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });
    edgeForm.addEventListener("change", (event) => {
      if (event.target.closest(".inline-title-editor")) {
        return;
      }
      if (event.target.closest(".endpoint-combobox")) {
        return;
      }
      submitEdgeDetails();
    });
    edgeForm.addEventListener("input", (event) => {
      if (event.target.closest(".inline-title-editor")) {
        return;
      }
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
    edgeForm.querySelectorAll(".edge-type-trigger").forEach((trigger) => {
      trigger.addEventListener("click", () => toggleEdgeTypePicker(trigger));
      trigger.addEventListener("keydown", (event) => event.stopPropagation());
    });
    edgeForm.querySelectorAll(".edge-type-picker").forEach((picker) => {
      picker.addEventListener("focusout", () => {
        setTimeout(() => {
          if (!picker.contains(document.activeElement)) {
            closeEdgeTypePicker(picker);
          }
        }, 0);
      });
    });
    edgeForm.querySelectorAll(".edge-type-option").forEach((option) => {
      option.addEventListener("click", () => selectEdgeTypeOption(option));
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
        required: itemEl.dataset.itemRequired === "true"
      }))
    }));
  }

  function manageTaxonomy(kind, action, targetId = "") {
    if (!kind || !action) {
      return;
    }
    const flow = state.flow;
    const currentId = action === "create" ? "" : targetId || getSelectedTaxonomyId(kind) || taxonomySelection[kind] || "";
    const current = getTaxonomyItems(flow, kind).find((item) => getTaxonomyId(kind, item) === currentId);
    if (action === "create") {
      const item = createDefaultTaxonomyItem(flow, kind);
      const id = getTaxonomyId(kind, item);
      addTaxonomyItemLocally(flow, kind, item);
      if (kind === "statusGroup") {
        render();
      } else {
        selectTaxonomyItem(kind, id);
      }
      vscode.postMessage({ type: "updateTaxonomy", request: { kind, action, id, item } });
      return;
    }
    if (!current) {
      return;
    }
    if (action === "delete") {
      if (kind !== "statusGroup") {
        clearTaxonomySelection(kind, currentId);
      }
      removeTaxonomyItemLocally(flow, kind, currentId);
      vscode.postMessage({ type: "updateTaxonomy", request: { kind, action, id: currentId } });
      render();
      return;
    }
  }

  function createDefaultTaxonomyItem(flow, kind) {
    const index = getTaxonomyItems(flow, kind).length + 1;
    if (kind === "appSurface") {
      return {
        appId: makeClientId("app"),
        name: `新应用端 ${index}`,
        type: "other",
        description: "",
        domainIds: [],
        roleIds: []
      };
    }
    if (kind === "domain") {
      return {
        domainId: makeClientId("domain"),
        name: `新业务域 ${index}`,
        description: ""
      };
    }
    if (kind === "statusGroup") {
      return {
        statusGroupId: makeClientId("status"),
        title: `新状态组 ${index}`,
        color: randomStatusGroupColor(getStatusGroups(flow))
      };
    }
    return {
      roleId: makeClientId("role"),
      name: `新角色 ${index}`,
      description: "",
      domainIds: []
    };
  }

  function addTaxonomyItemLocally(flow, kind, item) {
    if (kind === "appSurface") {
      flow.appSurfaces = flow.appSurfaces || [];
      flow.appSurfaces.push(item);
      seedAppSurfacePositions(flow);
    } else if (kind === "domain") {
      flow.domains = flow.domains || [];
      flow.domains.push(item);
    } else if (kind === "role") {
      flow.roles = flow.roles || [];
      flow.roles.push(item);
    } else if (kind === "statusGroup") {
      flow.statusGroups = flow.statusGroups || [];
      flow.statusGroups.push(item);
    }
  }

  function removeTaxonomyItemLocally(flow, kind, id) {
    if (kind === "appSurface") {
      flow.appSurfaces = (flow.appSurfaces || []).filter((item) => item.appId !== id);
      flow.nodes.forEach((node) => {
        node.appSurfaceIds = (node.appSurfaceIds || []).filter((appId) => appId !== id);
      });
      flow.edges = flow.edges.filter((edge) => {
        if (edgeReferencesAppSurfaceEndpoint(edge, id)) {
          return false;
        }
        edge.appSurfaceIds = (edge.appSurfaceIds || []).filter((appId) => appId !== id);
        return true;
      });
      appSurfacePositions.delete(id);
    } else if (kind === "domain") {
      flow.domains = (flow.domains || []).filter((item) => item.domainId !== id);
    } else if (kind === "role") {
      flow.roles = (flow.roles || []).filter((item) => item.roleId !== id);
    } else if (kind === "statusGroup") {
      flow.statusGroups = (flow.statusGroups || []).filter((item) => item.statusGroupId !== id);
      flow.nodes.forEach((node) => {
        if (node.statusGroupId === id) {
          delete node.statusGroupId;
        }
      });
    }
  }

  function edgeReferencesAppSurfaceEndpoint(edge, appId) {
    return endpointReferencesAppSurface(edge.from, appId) ||
      endpointReferencesAppSurface(edge.to, appId) ||
      (!edge.from && edge.fromNodeId === appId) ||
      (!edge.to && edge.toNodeId === appId);
  }

  function endpointReferencesAppSurface(endpoint, appId) {
    return Boolean(endpoint && endpoint.kind === "appSurface" && endpointEntityId(endpoint) === appId);
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

  function shouldLetPanelHandleWheel(target) {
    return Boolean(target?.closest?.(".floating-taxonomy-controls, .floating-taxonomy-panels"));
  }

  function handleWheel(event) {
    if (shouldLetPanelHandleWheel(event.target)) {
      return;
    }
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
    vscode.postMessage({ type: "createEdge", from, to, trigger: "手动连接", edgeType: "interaction" });
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
        type: "interaction",
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
      !element.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") &&
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
      event.target.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") ||
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
      clearNodeSelectionState();
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
      moved: false,
      multiSelect: kind === "node" && isNodeMultiSelectEvent(event)
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
    const screenDx = event.clientX - dragState.startX;
    const screenDy = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(screenDx, screenDy) <= CARD_DRAG_THRESHOLD_PX) {
      return;
    }
    const dx = screenDx / zoom;
    const dy = screenDy / zoom;
    if (!dragState.moved) {
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
    const { kind, id, card, moved, multiSelect } = dragState;
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
        clearNodeSelectionState();
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
        const multi = Boolean(multiSelect || isNodeMultiSelectEvent(event));
        if (multi) {
          event.preventDefault();
        }
        suppressNextNodeCardGeneratedClick();
        vscode.postMessage({ type: "saveNodePosition", nodeId: id, x: pos.x, y: pos.y });
        selectNode(id, false, { multi });
      }
      return;
    }
    if (kind === "appSurface") {
      selectAppSurface(id);
      return;
    }
    const multi = Boolean(multiSelect || isNodeMultiSelectEvent(event));
    if (multi) {
      event.preventDefault();
    }
    suppressNextNodeCardGeneratedClick();
    selectNode(id, false, { multi });
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
      event.target.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") ||
      event.target.closest("[data-edge-id]") ||
      event.target.closest("button, input, textarea, select") ||
      connectionDrag
    ) {
      return;
    }
    clearSelection();
  }

  function clearSelection() {
    clearNodeSelectionState();
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
    if (selectedNodeIds.length > 1) {
      event.preventDefault();
      return;
    }
    if (selectedNodeIds.length === 1) {
      const nodeId = selectedNodeIds[0];
      const node = state.flow.nodes.find((item) => item.nodeId === nodeId);
      if (node && node.status !== "removed") {
        event.preventDefault();
        clearTimeout(nodeDetailsSaveTimer);
        nodeDetailsSaveTimer = null;
        clearNodeSelectionState();
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
    clearNodeSelectionState();
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
    if (!selectedNodeId || selectedNodeIds.length !== 1) {
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
      statusGroupId: document.getElementById("nodeStatusGroupId")?.value || "",
      appSurfaceIds: collectTagMultiSelect("nodeAppSurfaceIds"),
      domainIds: collectTagMultiSelect("nodeDomainIds"),
      roleIds: collectTagMultiSelect("nodeRoleIds"),
      featureGroups: collectFeatureGroups()
    };
  }

  function postNodeDetails(nodeId, patch) {
    persistCurrentInspectorScroll();
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
      domainIds: collectTagMultiSelect("appSurfaceDomainIds"),
      roleIds: collectTagMultiSelect("appSurfaceRoleIds")
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
    surface.type = getAppSurfaceTypeOption(item.type).value || surface.type || "other";
    surface.description = item.description.trim();
    surface.domainIds = item.domainIds;
    surface.roleIds = item.roleIds;
  }

  function refreshAppSurfaceViews() {
    const title = document.getElementById("appSurfacePanelTitle");
    const titleInput = document.getElementById("appSurfaceName");
    const surface = (state.flow.appSurfaces || []).find((candidate) => candidate.appId === selectedAppSurfaceId);
    if (title && surface && title.dataset.inlineEditing !== "true") {
      title.textContent = surface.name;
    }
    if (titleInput && surface) {
      titleInput.value = surface.name;
    }
    refreshTaxonomyPanels();
    const world = document.getElementById("world");
    if (world) {
      seedAppSurfacePositions(state.flow);
      const activeNodes = state.flow.nodes.filter((node) => node.status !== "removed");
      world.innerHTML = `${renderAppSurfaceSourceCards(state.flow)}${activeNodes.map((node) => renderNodeCard(state.flow, node)).join("")}`;
      applyStatusGroupColorSwatches(world);
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
      ${taxonomyPanelsOpen.appSurface === true ? renderManagedList("appSurface", "应用端", state.flow.appSurfaces || [], "appId", "name", "description", appFilters) : ""}
      ${taxonomyPanelsOpen.domain === true ? renderManagedList("domain", "业务域", getAvailableDomains(state.flow), "domainId", "name", "description", domainFilters) : ""}
      ${taxonomyPanelsOpen.role === true ? renderManagedList("role", "角色", getAvailableRoles(state.flow), "roleId", "name", "description", roleFilters) : ""}
      ${taxonomyPanelsOpen.statusGroup === true ? renderStatusGroupList(getStatusGroups(state.flow)) : ""}
    `;
    bindTaxonomyControls(panels);
    applyStatusGroupColorSwatches(panels);
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
      type: document.getElementById("edgeType").dataset.edgeTypeValue || "interaction",
      condition: document.getElementById("edgeCondition").value,
      appSurfaceIds: collectTagMultiSelect("edgeAppSurfaceIds"),
      domainIds: collectTagMultiSelect("edgeDomainIds"),
      roleIds: collectTagMultiSelect("edgeRoleIds")
    };
  }

  function postEdgeDetails(edgeId, patch, revision) {
    persistCurrentInspectorScroll();
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
    if (patch.statusGroupId) {
      node.statusGroupId = patch.statusGroupId;
    } else {
      delete node.statusGroupId;
    }
    node.appSurfaceIds = patch.appSurfaceIds;
    node.domainIds = patch.domainIds;
    node.roleIds = patch.roleIds;
    node.featureGroups = patch.featureGroups;
    const title = document.getElementById("nodePanelTitle");
    const titleInput = document.getElementById("nodeTitle");
    if (title && title.dataset.inlineEditing !== "true") {
      title.textContent = node.title;
    }
    if (titleInput) {
      titleInput.value = node.title;
    }
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
    const titleInput = document.getElementById("edgeTriggerRule");
    if (title && title.dataset.inlineEditing !== "true") {
      title.textContent = edge.trigger;
    }
    if (titleInput) {
      titleInput.value = edge.trigger;
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
      applyStatusGroupColorSwatches(world);
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

  function selectNode(nodeId, center, options = {}) {
    if (options.multi) {
      toggleNodeSelection(nodeId);
    } else {
      setSelectedNodes([nodeId], nodeId);
    }
    selectedEdgeId = "";
    selectedAppSurfaceId = "";
    selectedDomainId = "";
    selectedRoleId = "";
    taxonomySelection = clearAllTaxonomySelections();
    if (selectedNodeId) {
      vscode.postMessage({ type: "selectNode", nodeId: selectedNodeId });
    } else {
      vscode.postMessage({ type: "clearSelection" });
    }
    render();
    requestAnimationFrame(() => {
      focusCanvas();
      if (center && selectedNodeIds.includes(nodeId)) {
        centerNode(nodeId);
      }
    });
  }

  function setSelectedNodes(nodeIds, primaryNodeId) {
    selectedNodeIds = uniqueStringIds(nodeIds);
    selectedNodeId = selectedNodeIds.includes(primaryNodeId)
      ? primaryNodeId
      : selectedNodeIds[0] || "";
  }

  function toggleNodeSelection(nodeId) {
    const current = new Set(selectedNodeIds);
    if (current.has(nodeId)) {
      current.delete(nodeId);
      const nextIds = selectedNodeIds.filter((id) => id !== nodeId);
      setSelectedNodes(nextIds, nextIds.includes(selectedNodeId) ? selectedNodeId : nextIds[nextIds.length - 1]);
      return;
    }
    setSelectedNodes([...selectedNodeIds, nodeId], nodeId);
  }

  function clearNodeSelectionState() {
    selectedNodeIds = [];
    selectedNodeId = "";
  }

  function isNodeSelected(nodeId) {
    return selectedNodeIds.includes(nodeId);
  }

  function isNodeMultiSelectEvent(event) {
    return Boolean(event?.metaKey || event?.ctrlKey || event?.shiftKey);
  }

  function suppressNextNodeCardGeneratedClick() {
    suppressNextNodeCardClick = true;
    suppressNextCanvasClick = true;
    setTimeout(() => {
      suppressNextNodeCardClick = false;
      suppressNextCanvasClick = false;
    }, CARD_CLICK_SUPPRESS_MS);
  }

  function selectEdge(edgeId) {
    selectedEdgeId = edgeId;
    clearNodeSelectionState();
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
    clearNodeSelectionState();
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
      const card = element.closest(".node-card, .app-surface-card");
      const cardRect = card?.getBoundingClientRect();
      const canvasRect = document.getElementById("canvas").getBoundingClientRect();
      const x = cardRect
        ? (direction === "to" ? cardRect.left - 1 : cardRect.right + 1)
        : rect.left + rect.width / 2;
      return {
        x: x - canvasRect.left,
        y: rect.top + rect.height / 2 - canvasRect.top,
        related: !card?.classList.contains("dimmed")
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

  function toggleEdgeTypePicker(trigger) {
    const picker = trigger.closest(".edge-type-picker");
    if (!picker) {
      return;
    }
    const open = !picker.classList.contains("open");
    picker.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeEdgeTypePicker(picker) {
    picker.classList.remove("open");
    picker.querySelector(".edge-type-trigger")?.setAttribute("aria-expanded", "false");
  }

  function selectEdgeTypeOption(option) {
    const picker = option.closest(".edge-type-picker");
    const trigger = picker?.querySelector(".edge-type-trigger");
    if (!picker || !trigger) {
      return;
    }
    const type = getEdgeTypeOption(option.dataset.edgeTypeOption);
    trigger.dataset.edgeTypeValue = type.value;
    trigger.innerHTML = renderEdgeTypeOptionContent(type);
    applyEdgeTypeColorSwatches(trigger);
    picker.querySelectorAll(".edge-type-option.selected").forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-selected", "false");
    });
    option.classList.add("selected");
    option.setAttribute("aria-selected", "true");
    closeEdgeTypePicker(picker);
    submitEdgeDetails({ immediate: true });
  }

  function togglePageTypePicker(trigger) {
    const picker = trigger.closest(".page-type-picker");
    if (!picker) {
      return;
    }
    const open = !picker.classList.contains("open");
    picker.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closePageTypePicker(picker) {
    picker.classList.remove("open");
    picker.querySelector(".page-type-trigger")?.setAttribute("aria-expanded", "false");
  }

  function selectPageTypeOption(option) {
    const picker = option.closest(".page-type-picker");
    const trigger = picker?.querySelector(".page-type-trigger");
    const input = document.getElementById("nodePageType");
    if (!picker || !trigger || !input) {
      return;
    }
    const type = getPageTypeOption(option.dataset.pageTypeOption);
    input.value = type.value;
    trigger.dataset.pageTypeValue = type.value;
    trigger.innerHTML = renderPageTypeOptionContent(type);
    picker.querySelectorAll(".page-type-option.selected").forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-selected", "false");
    });
    option.classList.add("selected");
    option.setAttribute("aria-selected", "true");
    closePageTypePicker(picker);
    commitNodeDetailsChange({ immediate: true });
  }

  function toggleAppSurfaceTypePicker(trigger) {
    const picker = trigger.closest(".app-surface-type-picker");
    if (!picker) {
      return;
    }
    const open = !picker.classList.contains("open");
    picker.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeAppSurfaceTypePicker(picker) {
    picker.classList.remove("open");
    picker.querySelector(".app-surface-type-trigger")?.setAttribute("aria-expanded", "false");
  }

  function selectAppSurfaceTypeOption(option) {
    const picker = option.closest(".app-surface-type-picker");
    const trigger = picker?.querySelector(".app-surface-type-trigger");
    const input = document.getElementById("appSurfaceType");
    if (!picker || !trigger || !input) {
      return;
    }
    const type = getAppSurfaceTypeOption(option.dataset.appSurfaceTypeOption);
    input.value = type.value;
    trigger.dataset.appSurfaceTypeValue = type.value;
    trigger.innerHTML = renderAppSurfaceTypeOptionContent(type);
    picker.querySelectorAll(".app-surface-type-option.selected").forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-selected", "false");
    });
    option.classList.add("selected");
    option.setAttribute("aria-selected", "true");
    closeAppSurfaceTypePicker(picker);
    commitAppSurfaceDetailsChange({ immediate: true });
  }

  function toggleStatusGroupPicker(trigger) {
    const picker = trigger.closest(".status-group-picker");
    if (!picker) {
      return;
    }
    const open = !picker.classList.contains("open");
    picker.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeStatusGroupPicker(picker) {
    picker.classList.remove("open");
    picker.querySelector(".status-group-trigger")?.setAttribute("aria-expanded", "false");
  }

  function selectStatusGroupOption(option) {
    const picker = option.closest(".status-group-picker");
    const trigger = picker?.querySelector(".status-group-trigger");
    const input = document.getElementById("nodeStatusGroupId");
    if (!picker || !trigger || !input) {
      return;
    }
    const value = option.dataset.statusGroupOption || "";
    input.value = value;
    trigger.dataset.statusGroupValue = value;
    trigger.innerHTML = option.innerHTML;
    applyStatusGroupColorSwatches(trigger);
    picker.querySelectorAll(".status-group-option.selected").forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-selected", "false");
    });
    option.classList.add("selected");
    option.setAttribute("aria-selected", "true");
    closeStatusGroupPicker(picker);
    commitNodeDetailsChange({ immediate: true });
  }

  function getAppSurfaceTypeOption(type) {
    const value = normalizeAppSurfaceTypeForSelect(type);
    return APP_SURFACE_TYPE_OPTIONS.find((option) => option.value === value) || APP_SURFACE_TYPE_OPTIONS[APP_SURFACE_TYPE_OPTIONS.length - 1];
  }

  function normalizeAppSurfaceTypeForSelect(type) {
    const value = String(type || "").trim().toLowerCase().replace(/\s+/g, "");
    if (value === "admin" || value === "backend" || value === "console" || value === "后台" || value === "管理后台") {
      return "admin";
    }
    if (value === "web" || value === "website" || value === "h5" || value === "网页" || value === "web端") {
      return "web";
    }
    if (value === "app" || value === "mobile" || value === "ios" || value === "android" || value === "移动端" || value === "app端") {
      return "app";
    }
    if (value === "miniapp" || value === "mini-app" || value === "miniprogram" || value === "小程序") {
      return "miniapp";
    }
    if (value === "desktop" || value === "pc" || value === "桌面端" || value === "客户端") {
      return "desktop";
    }
    return "other";
  }

  function getPageTypeOption(type) {
    const value = normalizePageTypeForSelect(type);
    return PAGE_TYPE_OPTIONS.find((option) => option.value === value) || PAGE_TYPE_OPTIONS[0];
  }

  function normalizePageTypeForSelect(type) {
    const value = String(type || "").trim().toLowerCase();
    if (value === "popup" || value === "modal" || value === "dialog" || value === "弹窗") {
      return "popup";
    }
    return "page";
  }

  function normalizeEdgeTypeForSelect(type) {
    const group = edgeTypeGroup(type);
    if (group === "status") return "statusChange";
    if (group === "auto") return "autoNavigate";
    if (group === "data") return "dataFlow";
    return "interaction";
  }

  function edgeTypeGroup(type) {
    if (type === "statusChange") {
      return "status";
    }
    if (type === "autoNavigate" || type === "navigate" || type === "branch") {
      return "auto";
    }
    if (type === "dataFlow" || type === "system") {
      return "data";
    }
    return "interaction";
  }

  function getEdgeTypeOption(value) {
    const normalizedValue = normalizeEdgeTypeForSelect(value);
    return EDGE_TYPE_OPTIONS.find((type) => type.value === normalizedValue) || EDGE_TYPE_OPTIONS[0];
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
    const activeNodeIds = new Set(flow.nodes.filter((node) => node.status !== "removed").map((node) => node.nodeId));
    selectedNodeIds = selectedNodeIds.filter((id) => activeNodeIds.has(id));
    if (selectedNodeIds.length === 0 && selectedNodeId && activeNodeIds.has(selectedNodeId)) {
      selectedNodeIds = [selectedNodeId];
    } else if (!selectedNodeIds.includes(selectedNodeId)) {
      selectedNodeId = selectedNodeIds[0] || "";
    }
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
    if (kind === "statusGroup") return getStatusGroups(flow);
    return flow.roles || [];
  }

  function getTaxonomyId(kind, item) {
    if (kind === "appSurface") return item.appId;
    if (kind === "domain") return item.domainId;
    if (kind === "statusGroup") return item.statusGroupId;
    return item.roleId;
  }

  function getStatusGroups(flow) {
    return Array.isArray(flow.statusGroups) ? flow.statusGroups : [];
  }

  function getStatusGroup(flow, statusGroupId) {
    return statusGroupId ? getStatusGroups(flow).find((group) => group.statusGroupId === statusGroupId) || null : null;
  }

  function normalizeStatusGroupColor(color) {
    return /^#[0-9a-fA-F]{6}$/.test(String(color || "").trim()) ? String(color).trim() : "#6b7280";
  }

  function applyStatusGroupColorSwatches(root = document) {
    root.querySelectorAll(".status-group-color-square[data-status-group-color]").forEach((swatch) => {
      const color = normalizeStatusGroupColor(swatch.dataset.statusGroupColor);
      swatch.style.backgroundColor = color;
      swatch.style.borderColor = color;
    });
  }

  function applyEdgeTypeColorSwatches(root = document) {
    root.querySelectorAll(".edge-type-swatch[data-edge-type-color]").forEach((swatch) => {
      const color = String(swatch.dataset.edgeTypeColor || "").trim() || "var(--vscode-charts-blue, #3794ff)";
      swatch.style.background = color;
      swatch.style.borderColor = color;
    });
  }

  function randomStatusGroupColor(existingGroups = []) {
    const usedColors = new Set(existingGroups.map((group) => normalizeStatusGroupColor(group.color).toLowerCase()));
    const hue = Math.floor(Math.random() * 360);
    for (let attempt = 0; attempt < 360; attempt += 1) {
      const color = hslToHex((hue + attempt * 37) % 360, 68, 54);
      if (!usedColors.has(color)) {
        return color;
      }
    }
    return hslToHex(hue, 68, 54);
  }

  function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
    return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function namesByIds(items, idKey, ids) {
    return ids
      .map((id) => items.find((item) => item[idKey] === id)?.name || id)
      .filter(Boolean)
      .join(" / ");
  }

  function getProductDesignIssues(flow) {
    const rawIssues = Array.isArray(flow?.productDesignIssues) ? flow.productDesignIssues : [];
    return rawIssues
      .map((issue, index) => normalizeProductDesignIssue(issue, index))
      .filter(Boolean);
  }

  function normalizeProductDesignIssue(issue, index) {
    if (!issue || typeof issue !== "object") {
      return null;
    }
    const severity = normalizeProductIssueSeverity(issue.severity);
    if (!severity) {
      return null;
    }
    const title = String(issue.title || issue.name || "").trim();
    const description = String(issue.description || issue.message || "").trim();
    if (!title && !description) {
      return null;
    }
    const prompt = String(issue.prompt || issue.resolutionPrompt || issue.instruction || "").trim() || buildProductIssuePrompt(title, description);
    return {
      issueId: String(issue.issueId || issue.id || `product_issue_${severity}_${index}`),
      severity,
      title: title || description.slice(0, 32) || "未命名问题",
      description: description || title,
      prompt
    };
  }

  function normalizeProductIssueSeverity(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "critical" || normalized === "severe" || normalized === "error" || normalized === "serious" || normalized === "严重") {
      return "critical";
    }
    if (normalized === "warning" || normalized === "warn" || normalized === "警告") {
      return "warning";
    }
    if (normalized === "optional" || normalized === "info" || normalized === "suggestion" || normalized === "可选") {
      return "optional";
    }
    return "";
  }

  function countProductIssues(issues) {
    return PRODUCT_ISSUE_SEVERITIES.reduce((result, item) => {
      result[item.value] = issues.filter((issue) => issue.severity === item.value).length;
      return result;
    }, {});
  }

  function buildProductIssuePrompt(title, description) {
    return `请基于当前 MindFlow 分析并完善以下产品设计问题：${title || description}。问题描述：${description || title}。请补充必要节点、连线、异常路径、角色权限、跨端状态和数据流转，并保持现有 schema 字段完整。`;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // Fall back to a temporary textarea when the webview clipboard API is unavailable.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.className = "clipboard-fallback";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function showToast(message) {
    const existing = document.querySelector(".mindflow-toast");
    if (existing) {
      existing.remove();
    }
    const toast = document.createElement("div");
    toast.className = "mindflow-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 180);
    }, 1600);
  }

  function collectMultiSelect(id) {
    const select = document.getElementById(id);
    return Array.from(select?.selectedOptions || []).map((option) => option.value);
  }

  function collectTagMultiSelect(id) {
    return Array.from(document.querySelectorAll(`#${cssEscape(id)} input[type="checkbox"]:checked`))
      .map((input) => input.value);
  }

  function readIdSelection(value, legacyValue) {
    if (Array.isArray(value)) {
      return uniqueStringIds(value);
    }
    return typeof legacyValue === "string" && legacyValue.trim() ? [legacyValue.trim()] : [];
  }

  function uniqueStringIds(value) {
    return Array.from(new Set((value || []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())));
  }

  function readTaxonomySelection(value) {
    return {
      appSurface: typeof value?.appSurface === "string" ? value.appSurface : "",
      domain: typeof value?.domain === "string" ? value.domain : "",
      role: typeof value?.role === "string" ? value.role : ""
    };
  }

  function readTaxonomyPanelsOpen() {
    const value = persisted.taxonomyPanelsOpen || {};
    return {
      appSurface: value.appSurface === true,
      domain: value.domain === true,
      role: value.role === true,
      statusGroup: value.statusGroup === true
    };
  }

  function readInspectorScrollState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return Object.entries(value).reduce((result, [key, scrollTop]) => {
      const normalized = Number(scrollTop);
      if (typeof key === "string" && key && Number.isFinite(normalized) && normalized >= 0) {
        result[key] = Math.round(normalized);
      }
      return result;
    }, {});
  }

  function inspectorScrollKey(kind, id) {
    return `${kind}:${id || ""}`;
  }

  function currentInspectorScrollKey() {
    const form = document.querySelector(".inspector .details-form[data-inspector-key]");
    return typeof form?.dataset.inspectorKey === "string" ? form.dataset.inspectorKey : "";
  }

  function persistCurrentInspectorScroll() {
    const inspector = document.querySelector(".inspector");
    const key = currentInspectorScrollKey();
    if (!inspector || !key) {
      return;
    }
    const scrollTop = Math.max(0, Math.round(inspector.scrollTop));
    if (inspectorScrollState[key] === scrollTop) {
      return;
    }
    inspectorScrollState = {
      ...inspectorScrollState,
      [key]: scrollTop
    };
    persistUiState();
  }

  function restoreInspectorScroll() {
    const inspector = document.querySelector(".inspector");
    const key = currentInspectorScrollKey();
    const scrollTop = Number(inspectorScrollState[key]);
    if (!inspector || !key || !Number.isFinite(scrollTop)) {
      return;
    }
    const restore = () => {
      inspector.scrollTop = scrollTop;
    };
    restore();
    requestAnimationFrame(restore);
  }

  function makeClientId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function persistUiState() {
    vscode.setState({
      appFilters,
      domainFilters,
      roleFilters,
      taxonomyPanelsOpen,
      taxonomySelection,
      selectedNodeId,
      selectedNodeIds,
      selectedAppSurfaceId,
      selectedDomainId,
      selectedRoleId,
      nodeSearch,
      leftPanelCollapsed,
      productIssuesPanelOpen,
      activeProductIssueSeverity,
      zoom,
      camera,
      connectingFrom,
      pendingEdgeDetailsSaves,
      inspectorScrollState
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
