"use strict";
(() => {
  (() => {
    var MindFlowCanvas = window.MindFlowCanvas = window.MindFlowCanvas || {};
    MindFlowCanvas.version = 1;
    function requireElementById(id) {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`MindFlow webview missing required element: #${id}`);
      }
      return element;
    }
    function requireInputValue(id) {
      const element = requireElementById(id);
      return typeof element.value === "string" ? element.value : "";
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
        role: typeof value?.role === "string" ? value.role : "",
        statusGroup: typeof value?.statusGroup === "string" ? value.statusGroup : ""
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
    function readPendingEdgeDetailsSaves(value) {
      if (!Array.isArray(value)) {
        return [];
      }
      const now = Date.now();
      return value.filter(
        (entry) => entry && typeof entry.edgeId === "string" && isUsableEdgeDetailsPatch(entry.patch) && Number.isFinite(Number(entry.savedAt)) && now - Number(entry.savedAt) <= PENDING_EDGE_DETAILS_TTL_MS
      ).map((entry) => ({
        edgeId: entry.edgeId,
        revision: Number(entry.revision) || 0,
        savedAt: Number(entry.savedAt),
        patch: entry.patch
      }));
    }
    function isUsableEdgeDetailsPatch(patch) {
      return Boolean(
        patch && patch.from && patch.to && typeof patch.from.kind === "string" && typeof patch.from.nodeId === "string" && typeof patch.to.kind === "string" && typeof patch.to.nodeId === "string" && typeof patch.trigger === "string" && typeof patch.type === "string" && typeof patch.condition === "string"
      );
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
    function readCommandStatus(value) {
      if (!value || value.kind !== "ok" && value.kind !== "error" || typeof value.message !== "string") {
        return null;
      }
      const at = Number(value.at);
      if (!Number.isFinite(at)) {
        return null;
      }
      if (value.kind === "ok" && Date.now() - at > 3e3) {
        return null;
      }
      return {
        kind: value.kind,
        message: value.message,
        at
      };
    }
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }
    const vscode = acquireVsCodeApi();
    const state = window.__MINDFLOW_STATE__;
    const app = requireElementById("app");
    const persisted = vscode.getState() || {};
    const CARD_WIDTH = 300;
    const CARD_MIN_HEIGHT = 230;
    const PROJECT_OVERVIEW_NODE_ID = "projectOverview";
    const PROJECT_OVERVIEW_WIDTH = 340;
    const PROJECT_OVERVIEW_DEFAULT_X = -760;
    const PROJECT_OVERVIEW_DEFAULT_Y = 0;
    const CARD_DRAG_THRESHOLD_PX = 4;
    const CARD_CLICK_SUPPRESS_MS = 100;
    const MIN_ZOOM = 0.2;
    const MAX_ZOOM = 2.6;
    const EDGE_TYPE_OPTIONS = [
      {
        value: "interaction",
        group: "interaction",
        label: "\u4EA4\u4E92\u89E6\u53D1",
        color: "var(--vscode-charts-blue, #3794ff)",
        description: "\u7528\u6237\u901A\u8FC7\u6267\u884C\u64CD\u4F5C(\u5982\u9F20\u6807\u70B9\u51FB\u3001\u5C4F\u5E55\u89E6\u63A7\u7B49\u884C\u4E3A)\u4E3B\u52A8\u89E6\u53D1\u7684\u8DF3\u8F6C\u884C\u4E3A\uFF1B"
      },
      {
        value: "autoNavigate",
        group: "auto",
        label: "\u81EA\u52A8\u8DF3\u8F6C",
        color: "var(--vscode-charts-green, #89d185)",
        description: "\u5E94\u7528/\u7CFB\u7EDF\u81EA\u52A8\u6267\u884C\u7684\u8DF3\u8F6C\u884C\u4E3A(\u5982\u540E\u53F0\u8BA1\u7B97\u5B8C\u6210\u3001\u652F\u4ED8\u5B8C\u6210\u7B49)\uFF1B"
      },
      {
        value: "dataFlow",
        group: "data",
        label: "\u6570\u636E\u6D41\u8F6C",
        color: "var(--vscode-charts-purple, #b180d7)",
        description: "\u5F53\u7528\u6237\u4E3B\u52A8\u89E6\u53D1\u6216\u7CFB\u7EDF\u81EA\u52A8\u89E6\u53D1\u67D0\u4E9B\u6761\u4EF6\u65F6\uFF0C\u63A7\u5236\u6570\u636E\u540C\u6B65(\u5982\u540E\u53F0\u53D1\u5E03\u6587\u7AE0\uFF0CAPP\u7AEF\u8FDB\u884C\u67E5\u770B)\uFF1B"
      },
      {
        value: "statusChange",
        group: "status",
        label: "\u72B6\u6001\u53D8\u66F4",
        color: "var(--vscode-charts-pink, #f472b6)",
        description: "\u7528\u6237\u4E3B\u52A8\u6216\u7CFB\u7EDF\u81EA\u52A8\u89E6\u53D1\uFF0C\u4F46\u8DF3\u8F6C\u6216\u6267\u884C\u76EE\u6807\u4EC5\u5728\u76F8\u540C\u72B6\u6001\u7EC4\u5185\u6267\u884C(\u7528\u4E8E\u72B6\u6001\u53D8\u66F4);"
      },
      {
        value: "nestedRelation",
        group: "nesting",
        label: "\u5D4C\u5957\u5173\u7CFB",
        color: "var(--vscode-charts-yellow, #facc15)",
        description: "\u6B64\u7C7B\u578B\u4EC5\u63CF\u8FF0\u9875\u9762\u5143\u7D20/\u7EC4\u4EF6\u95F4\u7684\u5D4C\u5957\u5173\u7CFB(\u5982\u7236\u5B50\u7EC4\u4EF6/\u5143\u7D20\u7EC4\u7684\u5D4C\u5957)"
      }
    ];
    const PAGE_TYPE_OPTIONS = [
      { value: "page", label: "\u9875\u9762", icon: "file-text" },
      { value: "popup", label: "\u5F39\u7A97", icon: "panel-top" },
      { value: "component", label: "\u7EC4\u4EF6", icon: "component" },
      { value: "navigation", label: "\u5BFC\u822A", icon: "navigation" },
      { value: "skeleton", label: "\u9AA8\u67B6", icon: "layout-template" }
    ];
    const APP_SURFACE_TYPE_OPTIONS = [
      { value: "admin", label: "\u7BA1\u7406\u540E\u53F0", icon: "shield-check" },
      { value: "web", label: "Web \u7AEF", icon: "globe" },
      { value: "app", label: "App \u7AEF", icon: "smartphone" },
      { value: "miniapp", label: "\u5C0F\u7A0B\u5E8F", icon: "scan-line" },
      { value: "desktop", label: "\u684C\u9762\u7AEF", icon: "monitor" },
      { value: "other", label: "\u5176\u4ED6\u7AEF", icon: "monitor-smartphone" }
    ];
    const PENDING_EDGE_DETAILS_TTL_MS = 15e3;
    const APP_SURFACE_SOURCE_X = -360;
    const APP_SURFACE_SOURCE_Y = 0;
    const APP_SURFACE_SOURCE_GAP = 240;
    let selectedNodeIds = readIdSelection(persisted.selectedNodeIds || state.selectedNodeIds, state.selectedNodeId || persisted.selectedNodeId);
    let selectedNodeId = selectedNodeIds.includes(persisted.selectedNodeId) ? persisted.selectedNodeId : selectedNodeIds.includes(state.selectedNodeId) ? state.selectedNodeId : selectedNodeIds[0] || state.selectedNodeId || persisted.selectedNodeId || "";
    if (selectedNodeIds.length === 0 && selectedNodeId) {
      selectedNodeIds = [selectedNodeId];
    } else if (selectedNodeId && !selectedNodeIds.includes(selectedNodeId)) {
      selectedNodeId = selectedNodeIds[0] || "";
    }
    let selectedProjectOverview = Boolean(state.selectedProjectOverview || persisted.selectedProjectOverview);
    let selectedEdgeId = state.selectedEdgeId || "";
    let selectedAppSurfaceId = state.selectedAppSurfaceId || persisted.selectedAppSurfaceId || "";
    let selectedDomainId = state.selectedDomainId || persisted.selectedDomainId || "";
    let selectedRoleId = state.selectedRoleId || persisted.selectedRoleId || "";
    let selectedStatusGroupId = state.selectedStatusGroupId || persisted.selectedStatusGroupId || "";
    let appFilters = readIdSelection(persisted.appFilters, persisted.appFilter);
    let domainFilters = readIdSelection(persisted.domainFilters, persisted.domainFilter);
    let roleFilters = readIdSelection(persisted.roleFilters, persisted.roleFilter);
    let taxonomySelection = readTaxonomySelection(persisted.taxonomySelection);
    selectedAppSurfaceId || (selectedAppSurfaceId = taxonomySelection.appSurface);
    selectedDomainId || (selectedDomainId = taxonomySelection.domain);
    selectedRoleId || (selectedRoleId = taxonomySelection.role);
    selectedStatusGroupId || (selectedStatusGroupId = taxonomySelection.statusGroup);
    if (selectedNodeId || selectedEdgeId || selectedAppSurfaceId || selectedDomainId || selectedRoleId || selectedStatusGroupId) {
      selectedProjectOverview = false;
    }
    let taxonomyPanelsOpen = readTaxonomyPanelsOpen();
    let nodeSearch = persisted.nodeSearch || "";
    let nodeSearchComposing = false;
    let leftPanelCollapsed = Boolean(persisted.leftPanelCollapsed);
    let zoom = clamp(Number(persisted.zoom || 1), MIN_ZOOM, MAX_ZOOM);
    let camera = persisted.camera && Number.isFinite(persisted.camera.x) && Number.isFinite(persisted.camera.y) ? { x: persisted.camera.x, y: persisted.camera.y } : { x: 800, y: 120 };
    let connectingFrom = persisted.connectingFrom || null;
    let connectionDrag = null;
    let connectionDropTarget = null;
    let dragState = null;
    let panState = null;
    let suppressNextCanvasClick = false;
    let suppressNextNodeCardClick = false;
    let featureDrag = null;
    let projectOverviewDetailsSaveTimer = null;
    let nodeDetailsSaveTimer = null;
    let appSurfaceDetailsSaveTimer = null;
    let domainDetailsSaveTimer = null;
    let roleDetailsSaveTimer = null;
    let statusGroupDetailsSaveTimer = null;
    let edgeDetailsSaveTimer = null;
    let edgeDetailsSaveRevision = 0;
    let pendingEdgeDetailsSaves = readPendingEdgeDetailsSaves(persisted.pendingEdgeDetailsSaves);
    let inspectorScrollState = readInspectorScrollState(persisted.inspectorScrollState);
    let framePending = false;
    const nodePositions = /* @__PURE__ */ new Map();
    const appSurfacePositions = /* @__PURE__ */ new Map();
    let projectOverviewPosition = null;
    let commandStatus = readCommandStatus(persisted.commandStatus);
    let commandStatusTimer = null;
    window.addEventListener("message", (event) => {
      handleHostMessage(event.data);
    });
    function postWebviewMessage(message) {
      vscode.postMessage(message);
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
    function renderProjectOverviewCard(flow) {
      const overview = getProjectOverview(flow);
      const summary = overview.summary || "\u6682\u65E0\u9879\u76EE\u7EFC\u8FF0";
      const goal = overview.goal || "\u6682\u65E0\u9879\u76EE\u76EE\u6807";
      return `
    <article class="project-overview-card ${selectedProjectOverview ? "selected" : ""}"
      data-project-overview-id="${escapeAttr(PROJECT_OVERVIEW_NODE_ID)}">
      <header class="project-overview-head">
        <div class="project-overview-title">
          <span class="project-overview-icon" aria-hidden="true">${renderLucideIcon("file-text")}</span>
          <div>
            <h3>${escapeHtml(flow.title || "\u9879\u76EE\u6982\u8FF0")}</h3>
            <small>\u9879\u76EE\u6982\u8FF0</small>
          </div>
        </div>
      </header>
      <section class="project-overview-copy">
        <div>
          <strong>\u9879\u76EE\u7EFC\u8FF0</strong>
          <p>${escapeHtml(summary)}</p>
        </div>
        <div>
          <strong>\u9879\u76EE\u76EE\u6807</strong>
          <p>${escapeHtml(goal)}</p>
        </div>
      </section>
      <div class="project-overview-taxonomy">
        ${renderProjectOverviewCardSection("appSurface", "\u5E94\u7528\u7AEF", "monitor-smartphone", flow.appSurfaces || [], "appId", "name", "description")}
        ${renderProjectOverviewCardSection("domain", "\u4E1A\u52A1\u57DF", "network", flow.domains || [], "domainId", "name", "description")}
        ${renderProjectOverviewCardSection("role", "\u89D2\u8272", "users", flow.roles || [], "roleId", "name", "description")}
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
        ${items.map((item) => renderProjectOverviewCardListItem(kind, item, idKey, labelKey, descriptionKey)).join("") || '<li class="empty compact">\u6682\u65E0\u6570\u636E</li>'}
      </ul>
    </section>
  `;
    }
    function renderProjectOverviewCardListItem(kind, item, idKey, labelKey, descriptionKey) {
      const itemId = item[idKey];
      const icon = kind === "appSurface" ? getAppSurfaceTypeOption(item.type).icon : kind === "domain" ? "network" : "user";
      return `
    <li class="project-overview-list-item" data-overview-kind="${escapeAttr(kind)}" data-overview-item-id="${escapeAttr(itemId)}">
      <span class="project-overview-list-icon" aria-hidden="true">${renderLucideIcon(icon)}</span>
      <span class="project-overview-list-text">
        <strong>${escapeHtml(item[labelKey])}</strong>
        <small>${escapeHtml(item[descriptionKey] || getTaxonomySecondaryText(kind, item) || "\u65E0\u8BF4\u660E")}</small>
      </span>
      ${kind === "appSurface" ? `<span class="project-overview-system-dot" data-project-overview-app-id="${escapeAttr(itemId)}" title="\u5E94\u7528\u7AEF\u7CFB\u7EDF\u8FDE\u63A5\u70B9" aria-hidden="true"></span>` : ""}
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
          title="\u8FDE\u7EBF\u5165\u53E3"
          aria-label="\u8FDE\u7EBF\u5165\u53E3"></button>
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
          title="\u5361\u7247\u8FDE\u7EBF\u51FA\u53E3"
          aria-label="\u5361\u7247\u8FDE\u7EBF\u51FA\u53E3"></button>
      </header>
      <p class="purpose">${escapeHtml(surface.description || "\u6682\u65E0\u4ECB\u7ECD")}</p>
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
    function renderFloatingTaxonomyControls() {
      const panelButtonId = leftPanelCollapsed ? "expandLeftPanel" : "collapseLeftPanel";
      const panelButtonLabel = leftPanelCollapsed ? "\u5C55\u5F00\u5DE6\u4FA7\u680F" : "\u6536\u8D77\u5DE6\u4FA7\u680F";
      const panelButtonIcon = leftPanelCollapsed ? "panel-left-open" : "panel-left-close";
      return `
    <div class="floating-taxonomy-controls" aria-label="\u5E94\u7528\u7AEF\u3001\u4E1A\u52A1\u57DF\u3001\u89D2\u8272\u3001\u72B6\u6001\u7EC4\u9762\u677F">
      ${renderIconButton(panelButtonId, panelButtonLabel, panelButtonIcon, "floating-icon")}
      ${renderTaxonomyToggleButton("appSurface", "\u5E94\u7528\u7AEF", "monitor-smartphone")}
      ${renderTaxonomyToggleButton("domain", "\u4E1A\u52A1\u57DF", "network")}
      ${renderTaxonomyToggleButton("role", "\u89D2\u8272", "users")}
      ${renderTaxonomyToggleButton("statusGroup", "\u72B6\u6001\u7EC4", "palette")}
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
    <div class="floating-taxonomy-panels" aria-label="\u5E94\u7528\u7AEF\u3001\u4E1A\u52A1\u57DF\u3001\u89D2\u8272\u3001\u72B6\u6001\u7EC4\u5217\u8868">
      ${taxonomyPanelsOpen.appSurface === true ? renderManagedList("appSurface", "\u5E94\u7528\u7AEF", flow.appSurfaces || [], "appId", "name", "description", appFilters) : ""}
      ${taxonomyPanelsOpen.domain === true ? renderManagedList("domain", "\u4E1A\u52A1\u57DF", getAvailableDomains(flow), "domainId", "name", "description", domainFilters) : ""}
      ${taxonomyPanelsOpen.role === true ? renderManagedList("role", "\u89D2\u8272", getAvailableRoles(flow), "roleId", "name", "description", roleFilters) : ""}
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
          ${renderTaxonomyActionButton(kind, "create", "\u65B0\u5EFA", "plus")}
        </div>
      </header>
      <div class="managed-list-body" role="listbox" aria-label="${escapeAttr(label)}\u5217\u8868">
        ${items.map((item) => {
        const itemId = item[idKey];
        const selected = selectedSet.has(itemId);
        const active = itemId === currentId;
        return `
            <div class="managed-list-item ${showFilters ? "" : "without-filter"} ${active ? "active" : ""}" data-kind="${kind}" data-taxonomy-id="${escapeAttr(itemId)}" role="option" tabindex="0" aria-selected="${active ? "true" : "false"}">
              ${showFilters ? `<input type="checkbox" class="taxonomy-filter-checkbox" data-kind="${kind}" value="${escapeAttr(itemId)}" ${selected ? "checked" : ""} aria-label="\u7B5B\u9009 ${escapeAttr(item[labelKey])}">` : `<span class="managed-list-kind-icon" aria-hidden="true">${renderLucideIcon(getManagedListItemIcon(kind, item))}</span>`}
              <span class="managed-list-text">
                <strong>${escapeHtml(item[labelKey])}</strong>
                <small>${escapeHtml(item[descriptionKey] || getTaxonomySecondaryText(kind, item) || "\u65E0\u8BF4\u660E")}</small>
              </span>
              ${renderTaxonomyActionButton(kind, "delete", `\u5220\u9664 ${item[labelKey]}`, "trash-2", false, "danger managed-list-row-action", `data-taxonomy-id="${escapeAttr(itemId)}"`)}
            </div>
          `;
      }).join("") || '<p class="empty compact">\u6682\u65E0\u6570\u636E</p>'}
      </div>
    </section>
  `;
    }
    function renderStatusGroupList(groups) {
      const currentId = getSelectedTaxonomyId("statusGroup");
      return `
    <section class="managed-list taxonomy-panel status-group-panel" data-kind="statusGroup" data-taxonomy-panel="statusGroup">
      <header class="managed-list-head">
        <h4>\u72B6\u6001\u7EC4</h4>
        <div class="tiny-actions">
          ${renderTaxonomyActionButton("statusGroup", "create", "\u65B0\u589E\u72B6\u6001\u7EC4", "plus")}
        </div>
      </header>
      <div class="managed-list-body status-group-list" role="listbox" aria-label="\u72B6\u6001\u7EC4\u5217\u8868">
        ${groups.map((group) => {
        const active = group.statusGroupId === currentId;
        return `
            <div class="managed-list-item status-group-list-item ${active ? "active" : ""}" data-kind="statusGroup" data-taxonomy-id="${escapeAttr(group.statusGroupId)}" role="option" tabindex="0" aria-selected="${active ? "true" : "false"}">
              <span class="status-group-color-square" data-status-group-color="${escapeAttr(normalizeStatusGroupColor(group.color))}" aria-hidden="true"></span>
              <span class="managed-list-text">
                <strong title="${escapeAttr(group.title)}">${escapeHtml(group.title)}</strong>
                <small>${escapeHtml(group.description || "\u65E0\u8BF4\u660E")}</small>
              </span>
              ${renderTaxonomyActionButton("statusGroup", "delete", `\u5220\u9664 ${group.title}`, "trash-2", false, "danger managed-list-row-action", `data-taxonomy-id="${escapeAttr(group.statusGroupId)}"`)}
            </div>
          `;
      }).join("") || '<p class="empty compact">\u6682\u65E0\u72B6\u6001\u7EC4</p>'}
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
    function renderTagMultiSelect(id, label, options, idKey, labelKey, selected) {
      const selectedSet = new Set(selected || []);
      const selectedLabels = options.filter((item) => selectedSet.has(item[idKey])).map((item) => item[labelKey]);
      return `
    <details class="tag-multi-select">
      <summary>
        <span>${escapeHtml(label)}</span>
        <span class="tag-summary">
          ${selectedLabels.length ? selectedLabels.map((name) => `<span class="selected-tag">${escapeHtml(name)}</span>`).join("") : '<span class="muted-tag">\u672A\u9009\u62E9</span>'}
        </span>
      </summary>
      <div id="${escapeAttr(id)}" class="tag-options" data-tag-multi-select="${escapeAttr(id)}">
        ${options.map((item) => `
          <label class="tag-option">
            <input type="checkbox" value="${escapeAttr(item[idKey])}" ${selectedSet.has(item[idKey]) ? "checked" : ""}>
            <span>${escapeHtml(item[labelKey])}</span>
          </label>
        `).join("") || '<p class="empty compact">\u6682\u65E0\u53EF\u9009\u9879</p>'}
      </div>
    </details>
  `;
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
          title="\u8FDE\u7EBF\u5165\u53E3"
          aria-label="\u8FDE\u7EBF\u5165\u53E3"></button>
        <div class="node-title">
          <h3>${escapeHtml(node.title)}</h3>
          <small>${escapeHtml(surfaces || "\u5168\u90E8\u5E94\u7528\u7AEF")}${entryAppNames ? ` \xB7 \u8D77\u59CB: ${escapeHtml(entryAppNames)}` : ""}</small>
        </div>
        <span>${escapeHtml(getPageTypeOption(node.pageType).label)}</span>
        <button class="origin-dot outlet-dot card-outlet ${connectingFrom && endpointKey(connectingFrom) === nodeOriginKey ? "active" : ""}"
          data-origin-kind="node"
          data-origin-node-id="${escapeAttr(node.nodeId)}"
          data-origin-key="${escapeAttr(nodeOriginKey)}"
          title="\u5361\u7247\u8FDE\u7EBF\u51FA\u53E3"
          aria-label="\u5361\u7247\u8FDE\u7EBF\u51FA\u53E3"></button>
      </header>
      ${renderNodeStatusGroupBadge(statusGroup)}
      <p class="purpose">${escapeHtml(node.purpose)}</p>
      <dl class="meta-grid">
        <dt title="\u4E1A\u52A1\u57DF" aria-label="\u4E1A\u52A1\u57DF">${renderLucideIcon("globe-2")}</dt><dd>${escapeHtml(domains || "\u672A\u8BBE\u7F6E")}</dd>
        <dt title="\u89D2\u8272" aria-label="\u89D2\u8272">${renderLucideIcon("user")}</dt><dd>${escapeHtml(roles || "\u672A\u8BBE\u7F6E")}</dd>
      </dl>
      <div class="feature-groups">
        ${groups.map((group) => renderFeatureGroup(group, node.nodeId)).join("") || '<p class="empty compact">\u6682\u65E0\u529F\u80FD</p>'}
      </div>
    </article>
  `;
    }
    function renderNodeStatusGroupBadge(statusGroup) {
      if (!statusGroup) {
        return "";
      }
      const title = statusGroup.title || "\u672A\u547D\u540D\u72B6\u6001\u7EC4";
      return `
    <div class="node-status-group" title="\u72B6\u6001\u7EC4: ${escapeAttr(title)}">
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
          <small>${escapeHtml(group.type)} \xB7 ${escapeHtml(group.description || "\u65E0\u8BF4\u660E")}</small>
        </div>
        <button class="origin-dot outlet-dot small ${connectingFrom && endpointKey(connectingFrom) === key ? "active" : ""}"
          data-origin-kind="featureGroup"
          data-origin-node-id="${escapeAttr(nodeId)}"
          data-origin-group-id="${escapeAttr(group.groupId)}"
          data-origin-key="${escapeAttr(key)}"
          title="\u529F\u80FD\u5206\u7EC4\u51FA\u53E3"
          aria-label="\u529F\u80FD\u5206\u7EC4\u51FA\u53E3"></button>
      </div>
      <ul class="feature-items">
        ${(group.items || []).map((item) => renderFeatureItem(item, nodeId, group.groupId)).join("") || '<li class="empty compact">\u6682\u65E0\u529F\u80FD\u9879</li>'}
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
        <small>${escapeHtml(item.type)} \xB7 ${escapeHtml(item.description || "\u65E0\u8BF4\u660E")}</small>
      </div>
      <button class="origin-dot outlet-dot tiny ${connectingFrom && endpointKey(connectingFrom) === key ? "active" : ""}"
        data-origin-kind="featureItem"
        data-origin-node-id="${escapeAttr(nodeId)}"
        data-origin-group-id="${escapeAttr(groupId)}"
        data-origin-item-id="${escapeAttr(item.itemId)}"
        data-origin-key="${escapeAttr(key)}"
        title="\u529F\u80FD\u9879\u51FA\u53E3"
        aria-label="\u529F\u80FD\u9879\u51FA\u53E3"></button>
    </li>
  `;
    }
    function renderNodeInspector(flow, node) {
      return `
    <form class="details-form" id="nodeDetailsForm" data-inspector-key="${escapeAttr(inspectorScrollKey("node", node.nodeId))}">
      <header class="inspector-head">
        <div>
          <h2 id="nodePanelTitle" class="inline-title-editor" tabindex="0" title="\u53CC\u51FB\u7F16\u8F91\u6807\u9898">${escapeHtml(node.title)}</h2>
          <code>${escapeHtml(node.nodeId)}</code>
        </div>
        <div class="inspector-actions">
          ${renderIconButton("closeInspector", "\u5173\u95ED\u8BE6\u60C5", "x")}
        </div>
      </header>
      <input id="nodeTitle" type="hidden" value="${escapeAttr(node.title)}">
      ${renderPageTypePicker(node.pageType)}
      <label>\u9875\u9762\u76EE\u7684
        <textarea id="nodePurpose" rows="4">${escapeHtml(node.purpose)}</textarea>
      </label>
      ${renderStatusGroupSelect(flow, node)}
      ${renderTagMultiSelect("nodeAppSurfaceIds", "\u5E94\u7528\u7AEF", flow.appSurfaces || [], "appId", "name", node.appSurfaceIds || [])}
      ${renderTagMultiSelect("nodeDomainIds", "\u4E1A\u52A1\u57DF", flow.domains, "domainId", "name", node.domainIds || [])}
      ${renderTagMultiSelect("nodeRoleIds", "\u89D2\u8272", flow.roles, "roleId", "name", node.roleIds || [])}
      <section class="feature-editor-section">
        <div class="section-title">
          <h3>\u529F\u80FD\u5206\u7EC4</h3>
          ${renderIconButton("addFeatureGroup", "\u65B0\u5EFA\u529F\u80FD\u5206\u7EC4", "plus", "feature-icon-button")}
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
      <span class="field-label">\u9875\u9762\u7C7B\u578B</span>
      <input id="nodePageType" type="hidden" value="${escapeAttr(selected.value)}">
      <div class="page-type-picker" data-page-type-picker>
        <button type="button"
          class="page-type-trigger"
          data-page-type-value="${escapeAttr(selected.value)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderPageTypeOptionContent(selected)}
        </button>
        <div class="page-type-menu" role="listbox" aria-label="\u9875\u9762\u7C7B\u578B">
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
    function renderStatusGroupSelect(flow, node) {
      const groups = getStatusGroups(flow);
      const selectedGroup = groups.find((group) => group.statusGroupId === node.statusGroupId) || null;
      const selectedId = selectedGroup?.statusGroupId || "";
      return `
    <div class="status-group-field">
      <span class="field-label">\u72B6\u6001\u7EC4</span>
      <input id="nodeStatusGroupId" type="hidden" value="${escapeAttr(selectedId)}">
      <div class="status-group-picker" data-status-group-picker>
        <button type="button"
          class="status-group-trigger"
          data-status-group-value="${escapeAttr(selectedId)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderStatusGroupOptionContent(selectedGroup)}
        </button>
        <div class="status-group-menu" role="listbox" aria-label="\u72B6\u6001\u7EC4">
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
        <strong>\u65E0\u72B6\u6001\u7EC4</strong>
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
    function renderFeatureEditorGroups(groups) {
      return groups.map((group, groupIndex) => `
    <section class="feature-edit-group" data-group-index="${groupIndex}" data-group-id="${escapeAttr(group.groupId || makeClientId("group"))}">
      <div class="feature-edit-group-head" data-drop-kind="group" data-group-index="${groupIndex}">
        ${renderIconActionButton("drag-handle", "\u62D6\u62FD\u6392\u5E8F\u529F\u80FD\u5206\u7EC4", "grip-vertical", `data-drag-kind="group" data-group-index="${groupIndex}"`)}
        <input class="group-name" value="${escapeAttr(group.name || "")}" placeholder="\u5206\u7EC4\u540D\u79F0">
        <input class="group-type" value="${escapeAttr(group.type || "section")}" placeholder="\u7C7B\u578B">
        ${renderIconActionButton("add-feature-item", "\u65B0\u5EFA\u529F\u80FD\u9879", "plus", `data-group-index="${groupIndex}"`)}
        ${renderIconActionButton("delete-feature-group danger-text", "\u5220\u9664\u529F\u80FD\u5206\u7EC4", "trash-2", `data-group-index="${groupIndex}"`)}
      </div>
      <textarea class="group-description" rows="2" placeholder="\u5206\u7EC4\u8BF4\u660E">${escapeHtml(group.description || "")}</textarea>
      <div class="feature-edit-items" data-drop-kind="items" data-group-index="${groupIndex}">
        ${(group.items || []).map((item, itemIndex) => renderFeatureEditorItem(item, groupIndex, itemIndex)).join("")}
      </div>
    </section>
  `).join("") || '<p class="empty">\u6682\u65E0\u529F\u80FD\u5206\u7EC4</p>';
    }
    function renderFeatureEditorItem(item, groupIndex, itemIndex) {
      return `
    <div class="feature-edit-item" data-group-index="${groupIndex}" data-item-index="${itemIndex}" data-item-id="${escapeAttr(item.itemId || makeClientId("item"))}" data-item-required="${item.required ? "true" : "false"}">
      <div class="feature-edit-item-main">
        ${renderIconActionButton("drag-handle", "\u62D6\u62FD\u6392\u5E8F\u529F\u80FD\u9879", "grip-vertical", `data-drag-kind="item" data-group-index="${groupIndex}" data-item-index="${itemIndex}"`)}
        <input class="item-name" value="${escapeAttr(item.name || "")}" placeholder="\u529F\u80FD\u9879\u540D\u79F0">
        ${renderIconActionButton("delete-feature-item danger-text", "\u5220\u9664\u529F\u80FD\u9879", "trash-2", `data-group-index="${groupIndex}" data-item-index="${itemIndex}"`)}
      </div>
      <input class="item-type" value="${escapeAttr(item.type || "text")}" placeholder="\u7C7B\u578B">
      <textarea class="item-description" rows="2" placeholder="\u529F\u80FD\u9879\u4ECB\u7ECD">${escapeHtml(item.description || "")}</textarea>
    </div>
  `;
    }
    function renderAppSurfaceTypePicker(surfaceType) {
      const selected = getAppSurfaceTypeOption(surfaceType);
      return `
    <div class="app-surface-type-field">
      <span class="field-label">\u5E94\u7528\u7AEF\u7C7B\u578B</span>
      <input id="appSurfaceType" type="hidden" value="${escapeAttr(selected.value)}">
      <div class="app-surface-type-picker" data-app-surface-type-picker>
        <button type="button"
          class="app-surface-type-trigger"
          data-app-surface-type-value="${escapeAttr(selected.value)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderAppSurfaceTypeOptionContent(selected)}
        </button>
        <div class="app-surface-type-menu" role="listbox" aria-label="\u5E94\u7528\u7AEF\u7C7B\u578B">
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
    function renderProjectOverviewInspector(flow) {
      const overview = getProjectOverview(flow);
      return `
    <form class="details-form" id="projectOverviewDetailsForm" data-inspector-key="${escapeAttr(inspectorScrollKey("projectOverview", PROJECT_OVERVIEW_NODE_ID))}">
      <header class="inspector-head">
        <div>
          <h2 id="projectOverviewPanelTitle" class="inline-title-editor" tabindex="0" title="\u53CC\u51FB\u7F16\u8F91\u6807\u9898">${escapeHtml(flow.title || "\u9879\u76EE\u6982\u8FF0")}</h2>
          <code>${escapeHtml(PROJECT_OVERVIEW_NODE_ID)}</code>
        </div>
        ${renderIconButton("closeInspector", "\u5173\u95ED\u8BE6\u60C5", "x")}
      </header>
      <input id="projectOverviewTitle" type="hidden" value="${escapeAttr(flow.title || "\u9879\u76EE\u6982\u8FF0")}">
      <label>\u9879\u76EE\u7EFC\u8FF0
        <textarea id="projectOverviewSummary" rows="5">${escapeHtml(overview.summary || "")}</textarea>
      </label>
      <label>\u9879\u76EE\u76EE\u6807
        <textarea id="projectOverviewGoal" rows="5">${escapeHtml(overview.goal || "")}</textarea>
      </label>
      <section class="project-overview-inspector-taxonomy">
        <div class="section-title">
          <h3>\u5E94\u7528\u7AEF</h3>
        </div>
        ${renderManagedList("appSurface", "\u5E94\u7528\u7AEF", flow.appSurfaces || [], "appId", "name", "description", [], { showFilters: false, panelClass: "embedded-taxonomy-panel" })}
        <div class="section-title">
          <h3>\u4E1A\u52A1\u57DF</h3>
        </div>
        ${renderManagedList("domain", "\u4E1A\u52A1\u57DF", flow.domains || [], "domainId", "name", "description", [], { showFilters: false, panelClass: "embedded-taxonomy-panel" })}
        <div class="section-title">
          <h3>\u89D2\u8272</h3>
        </div>
        ${renderManagedList("role", "\u89D2\u8272", flow.roles || [], "roleId", "name", "description", [], { showFilters: false, panelClass: "embedded-taxonomy-panel" })}
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
          <h2 id="appSurfacePanelTitle" class="inline-title-editor" tabindex="0" title="\u53CC\u51FB\u7F16\u8F91\u6807\u9898">${escapeHtml(surface.name)}</h2>
          <code>${escapeHtml(surface.appId)}</code>
        </div>
        ${renderIconButton("closeInspector", "\u5173\u95ED\u8BE6\u60C5", "x")}
      </header>
      <input id="appSurfaceName" type="hidden" value="${escapeAttr(surface.name)}">
      ${renderAppSurfaceTypePicker(surface.type)}
      <label>\u5E94\u7528\u7AEF\u4ECB\u7ECD
        <textarea id="appSurfaceDescription" rows="4">${escapeHtml(surface.description || "")}</textarea>
      </label>
      ${renderTagMultiSelect("appSurfaceDomainIds", "\u5173\u8054\u4E1A\u52A1\u57DF", flow.domains || [], "domainId", "name", surface.domainIds || [])}
      ${renderTagMultiSelect("appSurfaceRoleIds", "\u5173\u8054\u89D2\u8272", flow.roles || [], "roleId", "name", surface.roleIds || [])}
      <p class="form-error" id="appSurfaceFormError"></p>
    </form>
  `;
    }
    function renderDomainInspector(domain) {
      return `
    <form class="details-form" id="domainDetailsForm">
      <header class="inspector-head">
        <div>
          <h2 id="domainPanelTitle" class="inline-title-editor" tabindex="0" title="\u53CC\u51FB\u7F16\u8F91\u6807\u9898">${escapeHtml(domain.name)}</h2>
          <code>${escapeHtml(domain.domainId)}</code>
        </div>
        ${renderIconButton("closeInspector", "\u5173\u95ED\u8BE6\u60C5", "x")}
      </header>
      <input id="domainName" type="hidden" value="${escapeAttr(domain.name)}">
      <label>\u4E1A\u52A1\u57DF\u8BF4\u660E
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
          <h2 id="rolePanelTitle" class="inline-title-editor" tabindex="0" title="\u53CC\u51FB\u7F16\u8F91\u6807\u9898">${escapeHtml(role.name)}</h2>
          <code>${escapeHtml(role.roleId)}</code>
        </div>
        ${renderIconButton("closeInspector", "\u5173\u95ED\u8BE6\u60C5", "x")}
      </header>
      <input id="roleName" type="hidden" value="${escapeAttr(role.name)}">
      <label>\u89D2\u8272\u8BF4\u660E
        <textarea id="roleDescription" rows="4">${escapeHtml(role.description || "")}</textarea>
      </label>
      ${renderMultiSelect("roleDomainIds", "\u5173\u8054\u4E1A\u52A1\u57DF", flow.domains || [], "domainId", "name", role.domainIds || [])}
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
          <h2 id="statusGroupPanelTitle" class="inline-title-editor" tabindex="0" title="\u53CC\u51FB\u7F16\u8F91\u6807\u9898">${escapeHtml(statusGroup.title)}</h2>
          <code>${escapeHtml(statusGroup.statusGroupId)}</code>
        </div>
        ${renderIconButton("closeInspector", "\u5173\u95ED\u8BE6\u60C5", "x")}
      </header>
      <input id="statusGroupTitle" type="hidden" value="${escapeAttr(statusGroup.title)}">
      <label>\u72B6\u6001\u7EC4\u8BF4\u660E
        <textarea id="statusGroupDescription" rows="4">${escapeHtml(statusGroup.description || "")}</textarea>
      </label>
      <label class="status-group-color-field">\u989C\u8272
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
          <h2 id="edgePanelTitle" class="inline-title-editor" tabindex="0" title="\u53CC\u51FB\u7F16\u8F91\u6807\u9898">${escapeHtml(triggerRule)}</h2>
          <code>${escapeHtml(edge.edgeId)}</code>
        </div>
        ${renderIconButton("closeInspector", "\u5173\u95ED\u8BE6\u60C5", "x")}
      </header>
      <input id="edgeTriggerRule" type="hidden" value="${escapeAttr(triggerRule)}">
      ${renderEndpointPicker("edgeFromEndpoint", "\u8D77\u70B9", flow, edge.from || { kind: "node", nodeId: edge.fromNodeId }, true)}
      ${renderEndpointPicker("edgeToEndpoint", "\u7EC8\u70B9", flow, edge.to || { kind: "node", nodeId: edge.toNodeId }, false)}
      ${renderEdgeTypePicker(selectedType)}
      <label>\u6761\u4EF6\u63CF\u8FF0
        <textarea id="edgeCondition" rows="3">${escapeHtml(edge.condition || "")}</textarea>
      </label>
      ${renderTagMultiSelect("edgeAppSurfaceIds", "\u5E94\u7528\u7AEF", flow.appSurfaces || [], "appId", "name", edge.appSurfaceIds || [])}
      ${renderTagMultiSelect("edgeDomainIds", "\u4E1A\u52A1\u57DF", flow.domains, "domainId", "name", edge.domainIds || [])}
      ${renderTagMultiSelect("edgeRoleIds", "\u89D2\u8272", flow.roles, "roleId", "name", edge.roleIds || [])}
      <p class="form-error" id="edgeFormError"></p>
    </form>
  `;
    }
    function renderEdgeTypePicker(selectedType) {
      const selected = getEdgeTypeOption(selectedType);
      return `
    <div class="edge-type-field">
      <span class="field-label">\u8DEF\u5F84\u7C7B\u578B</span>
      <div class="edge-type-picker" data-edge-type-picker>
        <button type="button"
          id="edgeType"
          class="edge-type-trigger"
          data-edge-type-value="${escapeAttr(selected.value)}"
          aria-haspopup="listbox"
          aria-expanded="false">
          ${renderEdgeTypeOptionContent(selected)}
        </button>
        <div class="edge-type-menu" role="listbox" aria-label="\u8DEF\u5F84\u7C7B\u578B">
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
    function renderEndpointPicker(id, label, flow, selectedEndpoint, includeFeatureEndpoints) {
      const selectedValue = encodeEndpoint(selectedEndpoint);
      const selectedLabel = endpointDisplayLabel(flow, selectedEndpoint);
      const nodes = flow.nodes.filter((node) => node.status !== "removed");
      const appSurfaces = flow.appSurfaces || [];
      const placeholder = includeFeatureEndpoints ? "\u68C0\u7D22\u5E76\u9009\u62E9\u5E94\u7528\u7AEF / \u8282\u70B9\u5361\u7247 / \u529F\u80FD\u5206\u7EC4 / \u529F\u80FD\u9879" : "\u68C0\u7D22\u5E76\u9009\u62E9\u76EE\u6807\u5E94\u7528\u7AEF / \u8282\u70B9\u5361\u7247";
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
      return renderEndpointOption(endpoint, `\u9879\u76EE\u6982\u8FF0 \xB7 ${flow.title || "\u9879\u76EE\u6982\u8FF0"}`, search, selectedValue, "standalone-option");
    }
    function renderEndpointAppSurfaceOption(surface, selectedValue) {
      const endpoint = { kind: "appSurface", nodeId: surface.appId, appId: surface.appId };
      const search = endpointSearchText([surface.name, surface.type, surface.description]);
      return renderEndpointOption(endpoint, `\u5E94\u7528\u7AEF\u5361\u7247 \xB7 ${surface.name}`, search, selectedValue, "standalone-option");
    }
    function renderEndpointNodeOptions(node, selectedValue, includeFeatureEndpoints) {
      const nodeEndpoint = { kind: "node", nodeId: node.nodeId };
      const nodeSearch2 = endpointSearchText([node.title, node.pageType, node.purpose]);
      return `
    <div class="endpoint-cascade-node" data-search="${escapeAttr(nodeSearch2)}">
      ${renderEndpointOption(nodeEndpoint, `\u8282\u70B9\u5361\u7247 \xB7 ${node.title}`, nodeSearch2, selectedValue)}
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
      ${renderEndpointOption(groupEndpoint, `\u529F\u80FD\u5206\u7EC4 \xB7 ${group.name}`, groupSearch, selectedValue)}
      <div class="endpoint-cascade-children">
        ${(group.items || []).map((item) => {
        const itemEndpoint = { kind: "featureItem", nodeId: node.nodeId, groupId: group.groupId, itemId: item.itemId };
        const itemSearch = endpointSearchText([node.title, group.name, item.name, item.type, item.description]);
        return renderEndpointOption(itemEndpoint, `\u529F\u80FD\u9879 \xB7 ${item.name}`, itemSearch, selectedValue);
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
    function render() {
      const flow = state.flow;
      seedProjectOverviewPosition(flow);
      seedNodePositions(flow);
      seedAppSurfacePositions(flow);
      normalizeFilters();
      const activeNodes = flow.nodes.filter((node) => node.status !== "removed");
      const selectedNode = selectedNodeIds.length === 1 ? activeNodes.find((node) => node.nodeId === selectedNodeIds[0]) || null : null;
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
              <h2>\u8282\u70B9</h2>
              <small class="nodes-count" aria-label="\u8282\u70B9\u603B\u6570">${activeNodes.length}</small>
            </div>
          </header>
          <div class="node-search">
            <input id="nodeSearch" value="${escapeAttr(nodeSearch)}" placeholder="\u5FEB\u901F\u68C0\u7D22\u8282\u70B9\u5361\u7247">
          </div>
          <div class="node-list" aria-label="\u8282\u70B9\u5217\u8868">
            ${visibleListNodes.map((node) => renderNodeListItem(flow, node)).join("") || '<p class="empty">\u65E0\u5339\u914D\u8282\u70B9</p>'}
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
    ${renderManagedList("appSurface", "\u5E94\u7528\u7AEF", appSurfaces, "appId", "name", "description", appFilters)}
    ${renderManagedList("domain", "\u4E1A\u52A1\u57DF", domains, "domainId", "name", "description", domainFilters)}
    ${renderManagedList("role", "\u89D2\u8272", roles, "roleId", "name", "description", roleFilters)}
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
    function seedProjectOverviewPosition(flow) {
      if (projectOverviewPosition) {
        return;
      }
      const saved = flow.projectOverview && flow.projectOverview.view && flow.projectOverview.view.position;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        projectOverviewPosition = { x: saved.x, y: saved.y };
        return;
      }
      projectOverviewPosition = {
        x: PROJECT_OVERVIEW_DEFAULT_X,
        y: PROJECT_OVERVIEW_DEFAULT_Y
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
          x: index % 4 * 380,
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
      const projectOverviewCard = document.querySelector(".project-overview-card");
      if (projectOverviewCard && projectOverviewPosition) {
        projectOverviewCard.style.left = `${projectOverviewPosition.x}px`;
        projectOverviewCard.style.top = `${projectOverviewPosition.y}px`;
      }
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
    function startPan(event) {
      if (connectionDrag || event.button !== 0 && event.button !== 1 || event.target.closest(".project-overview-card") || event.target.closest(".node-card") || event.target.closest(".app-surface-card") || event.target.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") || event.target.closest("button, input, textarea, select") || event.target.closest("[data-edge-id]")) {
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
      }
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
          const from = endpointFromButton(originDot);
          if (from) {
            postCreateEdge(from, drag.endpoint);
          }
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
      postWebviewMessage({ type: "createEdge", from, to, trigger: "\u624B\u52A8\u8FDE\u63A5", edgeType: "interaction" });
    }
    function postCreateConnectedNode(link, event) {
      const point = screenToWorld(event.clientX, event.clientY);
      postWebviewMessage({
        type: "createConnectedNodeAt",
        request: {
          ...link,
          x: Math.round(point.x),
          y: Math.round(point.y),
          trigger: "\u624B\u52A8\u8FDE\u63A5",
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
        element && canvas?.contains(element) && !element.closest(".project-overview-card") && !element.closest(".node-card") && !element.closest(".app-surface-card") && !element.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") && !element.closest("[data-edge-id]") && !element.closest("button, input, textarea, select")
      );
    }
    function startNodeDrag(event) {
      startCardDrag(event, "node");
    }
    function startProjectOverviewDrag(event) {
      startCardDrag(event, "projectOverview");
    }
    function startAppSurfaceDrag(event) {
      startCardDrag(event, "appSurface");
    }
    function getCardPosition(kind, id) {
      if (kind === "projectOverview") {
        return projectOverviewPosition;
      }
      return kind === "appSurface" ? appSurfacePositions.get(id) : nodePositions.get(id);
    }
    function setCardPosition(kind, id, position) {
      if (kind === "projectOverview") {
        projectOverviewPosition = position;
        return;
      }
      const positions = kind === "appSurface" ? appSurfacePositions : nodePositions;
      positions.set(id, position);
    }
    function startCardDrag(event, kind) {
      if (event.button !== 0 || event.target.closest("button, input, textarea, select")) {
        return;
      }
      event.stopPropagation();
      const card = event.currentTarget;
      const id = kind === "appSurface" ? card.dataset.appSurfaceId : kind === "projectOverview" ? PROJECT_OVERVIEW_NODE_ID : card.dataset.nodeId;
      const pos = getCardPosition(kind, id);
      if (!id || !pos) {
        return;
      }
      selectedEdgeId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      if (kind === "appSurface") {
        selectedProjectOverview = false;
        clearNodeSelectionState();
        taxonomySelection = {
          appSurface: id,
          domain: "",
          role: "",
          statusGroup: ""
        };
      } else if (kind === "projectOverview") {
        selectedProjectOverview = true;
        clearNodeSelectionState();
        selectedAppSurfaceId = "";
        taxonomySelection = clearAllTaxonomySelections();
      } else {
        selectedProjectOverview = false;
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
      setCardPosition(dragState.kind, dragState.id, next);
      dragState.card.style.left = `${next.x}px`;
      dragState.card.style.top = `${next.y}px`;
      scheduleDrawEdges();
    }
    function endCardDrag(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      const { kind, id, card, moved, multiSelect } = dragState;
      const pos = getCardPosition(kind, id);
      card.classList.remove("dragging");
      card.removeEventListener("pointermove", moveCardDrag);
      card.removeEventListener("pointerup", endCardDrag);
      card.removeEventListener("pointercancel", endCardDrag);
      try {
        card.releasePointerCapture(event.pointerId);
      } catch {
      }
      dragState = null;
      if (moved && pos) {
        selectedEdgeId = "";
        if (kind === "appSurface") {
          selectedProjectOverview = false;
          selectedAppSurfaceId = id;
          clearNodeSelectionState();
          selectedDomainId = "";
          selectedRoleId = "";
          selectedStatusGroupId = "";
          taxonomySelection = {
            appSurface: id,
            domain: "",
            role: "",
            statusGroup: ""
          };
          persistUiState();
          postWebviewMessage({ type: "saveAppSurfacePosition", appId: id, x: pos.x, y: pos.y });
          postWebviewMessage({ type: "selectAppSurface", appId: id });
        } else if (kind === "projectOverview") {
          selectedProjectOverview = true;
          clearNodeSelectionState();
          selectedAppSurfaceId = "";
          selectedDomainId = "";
          selectedRoleId = "";
          selectedStatusGroupId = "";
          taxonomySelection = clearAllTaxonomySelections();
          persistUiState();
          postWebviewMessage({ type: "saveProjectOverviewPosition", x: pos.x, y: pos.y });
          postWebviewMessage({ type: "selectProjectOverview" });
        } else {
          const multi2 = Boolean(multiSelect || isNodeMultiSelectEvent(event));
          if (multi2) {
            event.preventDefault();
          }
          suppressNextNodeCardGeneratedClick();
          postWebviewMessage({ type: "saveNodePosition", nodeId: id, x: pos.x, y: pos.y });
          selectNode(id, false, { multi: multi2 });
        }
        return;
      }
      if (kind === "appSurface") {
        selectAppSurface(id);
        return;
      }
      if (kind === "projectOverview") {
        selectProjectOverview();
        return;
      }
      const multi = Boolean(multiSelect || isNodeMultiSelectEvent(event));
      if (multi) {
        event.preventDefault();
      }
      suppressNextNodeCardGeneratedClick();
      selectNode(id, false, { multi });
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
    function bindCanvasElements(root = document) {
      const projectOverviewCards = root.matches?.(".project-overview-card") ? [root] : Array.from(root.querySelectorAll(".project-overview-card"));
      projectOverviewCards.forEach((card) => {
        card.addEventListener("pointerdown", startProjectOverviewDrag);
        card.addEventListener("click", (event) => {
          if (event.target.closest("button, input, textarea, select")) {
            return;
          }
          if (!dragState) {
            selectProjectOverview();
          }
        });
      });
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
        button.addEventListener("pointerdown", (event) => {
          const endpoint = endpointFromButton(button);
          if (endpoint) {
            startConnectionDrag(event, "from", endpoint, button);
          }
        });
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
      selectedProjectOverview = false;
      if (kind === "statusGroup") {
        selectStatusGroup(id);
        return;
      }
      if (kind === "appSurface") {
        selectAppSurface(id);
        return;
      }
      clearNodeSelectionState();
      selectedEdgeId = "";
      selectedAppSurfaceId = "";
      selectedStatusGroupId = "";
      if (kind === "domain") {
        selectedDomainId = id;
        selectedRoleId = "";
        taxonomySelection = {
          appSurface: "",
          domain: id,
          role: "",
          statusGroup: ""
        };
        postWebviewMessage({ type: "selectDomain", domainId: id });
      } else {
        selectedDomainId = "";
        selectedRoleId = id;
        taxonomySelection = {
          appSurface: "",
          domain: "",
          role: id,
          statusGroup: ""
        };
        postWebviewMessage({ type: "selectRole", roleId: id });
      }
      persistUiState();
      render();
      requestAnimationFrame(() => focusCanvas());
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
        selectTaxonomyItem(kind, id);
        postWebviewMessage({ type: "updateTaxonomy", request: { kind, action, id, item } });
        return;
      }
      if (!current) {
        return;
      }
      if (action === "delete") {
        clearTaxonomySelection(kind, currentId);
        removeTaxonomyItemLocally(flow, kind, currentId);
        postWebviewMessage({ type: "updateTaxonomy", request: { kind, action, id: currentId } });
        render();
        return;
      }
    }
    function createDefaultTaxonomyItem(flow, kind) {
      const index = getTaxonomyItems(flow, kind).length + 1;
      if (kind === "appSurface") {
        return {
          appId: makeClientId("app"),
          name: `\u65B0\u5E94\u7528\u7AEF ${index}`,
          type: "other",
          description: "",
          domainIds: [],
          roleIds: []
        };
      }
      if (kind === "domain") {
        return {
          domainId: makeClientId("domain"),
          name: `\u65B0\u4E1A\u52A1\u57DF ${index}`,
          description: ""
        };
      }
      if (kind === "statusGroup") {
        return {
          statusGroupId: makeClientId("status"),
          title: `\u65B0\u72B6\u6001\u7EC4 ${index}`,
          description: "",
          color: randomStatusGroupColor(getStatusGroups(flow))
        };
      }
      return {
        roleId: makeClientId("role"),
        name: `\u65B0\u89D2\u8272 ${index}`,
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
      return endpointReferencesAppSurface(edge.from, appId) || endpointReferencesAppSurface(edge.to, appId) || !edge.from && edge.fromNodeId === appId || !edge.to && edge.toNodeId === appId;
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
      if (kind === "statusGroup" && selectedStatusGroupId === id) {
        selectedStatusGroupId = "";
      }
      persistUiState();
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
          name: "\u65B0\u529F\u80FD\u5206\u7EC4",
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
            name: "\u65B0\u529F\u80FD\u9879",
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
      const siblings = Array.from(featureDrag.container.querySelectorAll(`:scope > ${selector}`)).filter((item) => item !== featureDrag.row);
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
        name: groupEl.querySelector(".group-name").value.trim() || "\u672A\u547D\u540D\u5206\u7EC4",
        type: groupEl.querySelector(".group-type").value.trim() || "section",
        description: groupEl.querySelector(".group-description").value.trim(),
        items: Array.from(groupEl.querySelectorAll(".feature-edit-item")).map((itemEl) => ({
          itemId: itemEl.dataset.itemId || makeClientId("item"),
          name: itemEl.querySelector(".item-name").value.trim() || "\u672A\u547D\u540D\u529F\u80FD\u9879",
          type: itemEl.querySelector(".item-type").value.trim() || "text",
          description: itemEl.querySelector(".item-description").value.trim(),
          required: itemEl.dataset.itemRequired === "true"
        }))
      }));
    }
    function bindProjectOverviewInspector(projectOverviewForm) {
      bindInlineTitleEditor("projectOverviewPanelTitle", "projectOverviewTitle", () => commitProjectOverviewDetailsChange({ immediate: true }));
      projectOverviewForm.addEventListener("submit", (event) => {
        event.preventDefault();
        commitProjectOverviewDetailsChange({ immediate: true });
      });
      projectOverviewForm.addEventListener("input", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitProjectOverviewDetailsChange({ localOnly: true });
      });
      projectOverviewForm.addEventListener("change", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitProjectOverviewDetailsChange({ immediate: true });
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
        commitNodeDetailsChange({ localOnly: true });
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
        commitAppSurfaceDetailsChange({ localOnly: true });
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
      bindInlineTitleEditor("domainPanelTitle", "domainName", () => commitDomainDetailsChange({ immediate: true }));
      domainForm.addEventListener("submit", (event) => {
        event.preventDefault();
        commitDomainDetailsChange({ immediate: true });
      });
      domainForm.addEventListener("input", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitDomainDetailsChange({ localOnly: true });
      });
      domainForm.addEventListener("change", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitDomainDetailsChange({ immediate: true });
      });
    }
    function bindRoleInspector(roleForm) {
      bindInlineTitleEditor("rolePanelTitle", "roleName", () => commitRoleDetailsChange({ immediate: true }));
      roleForm.addEventListener("submit", (event) => {
        event.preventDefault();
        commitRoleDetailsChange({ immediate: true });
      });
      roleForm.addEventListener("input", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitRoleDetailsChange({ localOnly: true });
      });
      roleForm.addEventListener("change", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitRoleDetailsChange({ immediate: true });
      });
    }
    function bindStatusGroupInspector(statusGroupForm) {
      bindInlineTitleEditor("statusGroupPanelTitle", "statusGroupTitle", () => commitStatusGroupDetailsChange({ immediate: true }));
      statusGroupForm.addEventListener("submit", (event) => {
        event.preventDefault();
        commitStatusGroupDetailsChange({ immediate: true });
      });
      statusGroupForm.addEventListener("input", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitStatusGroupDetailsChange({ localOnly: true });
      });
      statusGroupForm.addEventListener("change", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        commitStatusGroupDetailsChange({ immediate: true });
      });
    }
    function bindEdgeInspector(edgeForm) {
      bindInlineTitleEditor("edgePanelTitle", "edgeTriggerRule", () => submitEdgeDetails({ immediate: true }));
      edgeForm.addEventListener("submit", (event) => {
        event.preventDefault();
        submitEdgeDetails({ immediate: true });
      });
      edgeForm.addEventListener("change", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        if (event.target.closest(".endpoint-combobox")) {
          return;
        }
        submitEdgeDetails({ immediate: true });
      });
      edgeForm.addEventListener("input", (event) => {
        if (event.target.closest(".inline-title-editor")) {
          return;
        }
        if (event.target.closest(".endpoint-combobox")) {
          filterEndpointOptions(event.target);
          return;
        }
        submitEdgeDetails({ localOnly: true });
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
    function handleContextMenu(event) {
      const canvas = document.getElementById("canvas");
      if (!canvas || !canvas.contains(event.target)) {
        return;
      }
      if (event.target.closest(".project-overview-card") || event.target.closest(".node-card") || event.target.closest(".app-surface-card") || event.target.closest("[data-edge-id]")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const point = screenToWorld(event.clientX, event.clientY);
      postWebviewMessage({
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
      if (event.target.closest(".node-card") || event.target.closest(".project-overview-card") || event.target.closest(".app-surface-card") || event.target.closest(".floating-taxonomy-controls, .floating-taxonomy-panels") || event.target.closest("[data-edge-id]") || event.target.closest("button, input, textarea, select") || connectionDrag) {
        return;
      }
      clearSelection();
    }
    function clearSelection() {
      selectedProjectOverview = false;
      clearNodeSelectionState();
      selectedEdgeId = "";
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = clearAllTaxonomySelections();
      connectingFrom = null;
      postWebviewMessage({ type: "clearSelection" });
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
          postWebviewMessage({ type: "deleteNode", nodeId, nodeTitle: node.title });
        }
        return;
      }
      if (selectedEdgeId) {
        event.preventDefault();
        clearTimeout(edgeDetailsSaveTimer);
        edgeDetailsSaveTimer = null;
        const edgeId = selectedEdgeId;
        selectedEdgeId = "";
        postWebviewMessage({ type: "removeEdge", edgeId });
        return;
      }
      if (selectedProjectOverview) {
        event.preventDefault();
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
        return;
      }
      if (selectedStatusGroupId) {
        event.preventDefault();
        deleteSelectedTaxonomy("statusGroup", selectedStatusGroupId);
      }
    }
    function deleteSelectedTaxonomy(kind, id) {
      if (!kind || !id) {
        return;
      }
      cancelPendingTaxonomyDetailsSave(kind);
      selectedProjectOverview = false;
      clearTaxonomySelection(kind, id);
      clearNodeSelectionState();
      selectedEdgeId = "";
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      connectingFrom = null;
      postWebviewMessage({ type: "updateTaxonomy", request: { kind, action: "delete", id } });
      render();
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
      applyEdgeTypeColorSwatches(document);
      applyStatusGroupColorSwatches(document);
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
      const projectOverviewForm = document.getElementById("projectOverviewDetailsForm");
      if (projectOverviewForm) {
        bindProjectOverviewInspector(projectOverviewForm);
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
      const statusGroupForm = document.getElementById("statusGroupDetailsForm");
      if (statusGroupForm) {
        bindStatusGroupInspector(statusGroupForm);
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
    function isEditingTarget(target) {
      return Boolean(target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable='true']"));
    }
    function submitNodeDetails(event) {
      event?.preventDefault();
      commitNodeDetailsChange({ immediate: true });
    }
    function commitProjectOverviewDetailsChange(options = {}) {
      if (!selectedProjectOverview) {
        return;
      }
      const patch = collectProjectOverviewDetailsPatch();
      applyProjectOverviewDetailsLocally(patch);
      refreshProjectOverviewViews();
      if (options.localOnly) {
        clearTimeout(projectOverviewDetailsSaveTimer);
        projectOverviewDetailsSaveTimer = null;
        return;
      }
      if (options.immediate) {
        postProjectOverviewDetails(patch);
        return;
      }
      clearTimeout(projectOverviewDetailsSaveTimer);
      projectOverviewDetailsSaveTimer = setTimeout(() => postProjectOverviewDetails(patch), 250);
    }
    function collectProjectOverviewDetailsPatch() {
      return {
        title: requireInputValue("projectOverviewTitle"),
        summary: requireInputValue("projectOverviewSummary"),
        goal: requireInputValue("projectOverviewGoal")
      };
    }
    function postProjectOverviewDetails(patch) {
      persistCurrentInspectorScroll();
      clearTimeout(projectOverviewDetailsSaveTimer);
      projectOverviewDetailsSaveTimer = null;
      postWebviewMessage({
        type: "updateProjectOverview",
        patch
      });
    }
    function commitNodeDetailsChange(options = {}) {
      if (!selectedNodeId || selectedNodeIds.length !== 1) {
        return;
      }
      const nodeId = selectedNodeId;
      const patch = collectNodeDetailsPatch();
      applyNodeDetailsLocally(nodeId, patch);
      refreshCanvasAndNodeList();
      if (options.localOnly) {
        clearTimeout(nodeDetailsSaveTimer);
        nodeDetailsSaveTimer = null;
        return;
      }
      if (options.immediate) {
        postNodeDetails(nodeId, patch);
        return;
      }
      clearTimeout(nodeDetailsSaveTimer);
      nodeDetailsSaveTimer = setTimeout(() => postNodeDetails(nodeId, patch), 250);
    }
    function collectNodeDetailsPatch() {
      return {
        title: requireInputValue("nodeTitle"),
        pageType: requireInputValue("nodePageType"),
        purpose: requireInputValue("nodePurpose"),
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
      postWebviewMessage({
        type: "updateNodeDetails",
        nodeId,
        patch
      });
    }
    function applyProjectOverviewDetailsLocally(patch) {
      const overview = getProjectOverview(state.flow);
      state.flow.title = patch.title.trim() || state.flow.title || "\u9879\u76EE\u6982\u8FF0";
      overview.summary = patch.summary.trim() || overview.summary;
      overview.goal = patch.goal.trim();
      const title = document.getElementById("projectOverviewPanelTitle");
      const titleInput = document.getElementById("projectOverviewTitle");
      if (title && title.dataset.inlineEditing !== "true") {
        title.textContent = state.flow.title;
      }
      if (titleInput) {
        titleInput.value = state.flow.title;
      }
    }
    function refreshProjectOverviewViews() {
      const card = document.querySelector(".project-overview-card");
      if (card) {
        const replacement = document.createElement("div");
        replacement.innerHTML = renderProjectOverviewCard(state.flow);
        const nextCard = replacement.firstElementChild;
        if (nextCard) {
          card.replaceWith(nextCard);
          bindCanvasElements(nextCard);
          positionCards();
          scheduleDrawEdges();
        }
      }
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
      } else if (kind === "statusGroup") {
        clearTimeout(statusGroupDetailsSaveTimer);
        statusGroupDetailsSaveTimer = null;
      }
    }
    function commitAppSurfaceDetailsChange(options = {}) {
      if (!selectedAppSurfaceId) {
        return;
      }
      const appId = selectedAppSurfaceId;
      const item = collectAppSurfaceDetailsPatch();
      applyAppSurfaceDetailsLocally(appId, item);
      refreshAppSurfaceViews();
      if (options.localOnly) {
        clearTimeout(appSurfaceDetailsSaveTimer);
        appSurfaceDetailsSaveTimer = null;
        return;
      }
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
        name: requireInputValue("appSurfaceName"),
        type: requireInputValue("appSurfaceType"),
        description: requireInputValue("appSurfaceDescription"),
        domainIds: collectTagMultiSelect("appSurfaceDomainIds"),
        roleIds: collectTagMultiSelect("appSurfaceRoleIds")
      };
    }
    function postAppSurfaceDetails(appId, item) {
      clearTimeout(appSurfaceDetailsSaveTimer);
      appSurfaceDetailsSaveTimer = null;
      postWebviewMessage({
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
      if (options.localOnly) {
        clearTimeout(domainDetailsSaveTimer);
        domainDetailsSaveTimer = null;
        return;
      }
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
        name: requireInputValue("domainName"),
        description: requireInputValue("domainDescription")
      };
    }
    function postDomainDetails(domainId, item) {
      clearTimeout(domainDetailsSaveTimer);
      domainDetailsSaveTimer = null;
      postWebviewMessage({
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
      const titleInput = document.getElementById("domainName");
      const domain = (state.flow.domains || []).find((candidate) => candidate.domainId === selectedDomainId);
      if (title && domain && title.dataset.inlineEditing !== "true") {
        title.textContent = domain.name;
      }
      if (titleInput && domain) {
        titleInput.value = domain.name;
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
      if (options.localOnly) {
        clearTimeout(roleDetailsSaveTimer);
        roleDetailsSaveTimer = null;
        return;
      }
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
        name: requireInputValue("roleName"),
        description: requireInputValue("roleDescription"),
        domainIds: collectMultiSelect("roleDomainIds")
      };
    }
    function postRoleDetails(roleId, item) {
      clearTimeout(roleDetailsSaveTimer);
      roleDetailsSaveTimer = null;
      postWebviewMessage({
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
      const titleInput = document.getElementById("roleName");
      const role = (state.flow.roles || []).find((candidate) => candidate.roleId === selectedRoleId);
      if (title && role && title.dataset.inlineEditing !== "true") {
        title.textContent = role.name;
      }
      if (titleInput && role) {
        titleInput.value = role.name;
      }
      refreshTaxonomyPanels();
      refreshCanvasAndNodeList();
    }
    function commitStatusGroupDetailsChange(options = {}) {
      if (!selectedStatusGroupId) {
        return;
      }
      const statusGroupId = selectedStatusGroupId;
      const item = collectStatusGroupDetailsPatch();
      applyStatusGroupDetailsLocally(statusGroupId, item);
      refreshStatusGroupViews();
      if (options.localOnly) {
        clearTimeout(statusGroupDetailsSaveTimer);
        statusGroupDetailsSaveTimer = null;
        return;
      }
      if (options.immediate) {
        postStatusGroupDetails(statusGroupId, item);
        return;
      }
      clearTimeout(statusGroupDetailsSaveTimer);
      statusGroupDetailsSaveTimer = setTimeout(() => postStatusGroupDetails(statusGroupId, item), 250);
    }
    function collectStatusGroupDetailsPatch() {
      return {
        statusGroupId: selectedStatusGroupId,
        title: requireInputValue("statusGroupTitle"),
        description: requireInputValue("statusGroupDescription"),
        color: normalizeStatusGroupColor(requireInputValue("statusGroupColor"))
      };
    }
    function postStatusGroupDetails(statusGroupId, item) {
      clearTimeout(statusGroupDetailsSaveTimer);
      statusGroupDetailsSaveTimer = null;
      postWebviewMessage({
        type: "updateTaxonomy",
        request: {
          kind: "statusGroup",
          action: "update",
          id: statusGroupId,
          item
        }
      });
    }
    function applyStatusGroupDetailsLocally(statusGroupId, item) {
      const statusGroup = getStatusGroup(state.flow, statusGroupId);
      if (!statusGroup) {
        return;
      }
      statusGroup.title = item.title.trim() || statusGroup.title;
      statusGroup.description = item.description.trim();
      statusGroup.color = normalizeStatusGroupColor(item.color || statusGroup.color);
    }
    function refreshStatusGroupViews() {
      const title = document.getElementById("statusGroupPanelTitle");
      const titleInput = document.getElementById("statusGroupTitle");
      const colorInput = document.getElementById("statusGroupColor");
      const colorValue = document.querySelector(".status-group-color-value");
      const statusGroup = getStatusGroup(state.flow, selectedStatusGroupId);
      if (title && statusGroup && title.dataset.inlineEditing !== "true") {
        title.textContent = statusGroup.title;
      }
      if (titleInput && statusGroup) {
        titleInput.value = statusGroup.title;
      }
      if (colorInput && statusGroup) {
        const color = normalizeStatusGroupColor(statusGroup.color);
        colorInput.value = color;
        if (colorValue) {
          colorValue.textContent = color;
        }
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
        seedProjectOverviewPosition(state.flow);
        seedAppSurfacePositions(state.flow);
        const activeNodes = state.flow.nodes.filter((node) => node.status !== "removed");
        world.innerHTML = `${renderProjectOverviewCard(state.flow)}${renderAppSurfaceSourceCards(state.flow)}${activeNodes.map((node) => renderNodeCard(state.flow, node)).join("")}`;
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
    ${taxonomyPanelsOpen.appSurface === true ? renderManagedList("appSurface", "\u5E94\u7528\u7AEF", state.flow.appSurfaces || [], "appId", "name", "description", appFilters) : ""}
    ${taxonomyPanelsOpen.domain === true ? renderManagedList("domain", "\u4E1A\u52A1\u57DF", getAvailableDomains(state.flow), "domainId", "name", "description", domainFilters) : ""}
    ${taxonomyPanelsOpen.role === true ? renderManagedList("role", "\u89D2\u8272", getAvailableRoles(state.flow), "roleId", "name", "description", roleFilters) : ""}
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
      if (options.localOnly) {
        clearTimeout(edgeDetailsSaveTimer);
        edgeDetailsSaveTimer = null;
        return;
      }
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
      const edge = state.flow.edges.find((item) => item.edgeId === selectedEdgeId);
      const fallbackFrom = edge?.from || (edge?.fromNodeId ? { kind: "node", nodeId: edge.fromNodeId } : void 0);
      const fallbackTo = edge?.to || (edge?.toNodeId ? { kind: "node", nodeId: edge.toNodeId } : void 0);
      const fromInput = requireElementById("edgeFromEndpoint");
      const toInput = requireElementById("edgeToEndpoint");
      const edgeTypeInput = requireElementById("edgeType");
      return {
        trigger: requireInputValue("edgeTriggerRule"),
        from: parseEndpointValue(fromInput.dataset.endpointValue, fallbackFrom),
        to: parseEndpointValue(toInput.dataset.endpointValue, fallbackTo),
        type: edgeTypeInput.dataset.edgeTypeValue || "interaction",
        condition: requireInputValue("edgeCondition"),
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
      postWebviewMessage({
        type: "updateEdgeDetails",
        edgeId,
        revision,
        patch
      });
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
      edge.condition = patch.condition.trim() || void 0;
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
      return value.filter(
        (entry) => entry && typeof entry.edgeId === "string" && isUsableEdgeDetailsPatch(entry.patch) && Number.isFinite(Number(entry.savedAt)) && now - Number(entry.savedAt) <= PENDING_EDGE_DETAILS_TTL_MS
      ).map((entry) => ({
        edgeId: entry.edgeId,
        revision: Number(entry.revision) || 0,
        savedAt: Number(entry.savedAt),
        patch: entry.patch
      }));
    }
    function isUsableEdgeDetailsPatch(patch) {
      return Boolean(
        patch && patch.from && patch.to && typeof patch.from.kind === "string" && typeof patch.from.nodeId === "string" && typeof patch.to.kind === "string" && typeof patch.to.nodeId === "string" && typeof patch.trigger === "string" && typeof patch.type === "string" && typeof patch.condition === "string"
      );
    }
    function edgeDetailsPatchMatches(edge, patch) {
      const from = edge.from || { kind: "node", nodeId: edge.fromNodeId };
      const to = edge.to || { kind: "node", nodeId: edge.toNodeId };
      return endpointKey(from) === endpointKey(patch.from) && endpointKey(to) === endpointKey(patch.to) && String(edge.trigger || edge.action || "") === String(patch.trigger || "").trim() && normalizeEdgeTypeForSelect(edge.type) === normalizeEdgeTypeForSelect(patch.type) && String(edge.condition || "") === String(patch.condition || "").trim() && sameStringSet(edge.appSurfaceIds || [], patch.appSurfaceIds || []) && sameStringSet(edge.domainIds || [], patch.domainIds || []) && sameStringSet(edge.roleIds || [], patch.roleIds || []);
    }
    function sameStringSet(left, right) {
      const leftValues = [...new Set((left || []).filter(Boolean))].sort();
      const rightValues = [...new Set((right || []).filter(Boolean))].sort();
      return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
    }
    function endpointFromButton(button) {
      if (button.dataset.originKind === "projectOverview") {
        return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
      }
      if (button.dataset.originKind === "appSurface") {
        const appId = button.dataset.originAppId || button.dataset.originNodeId;
        return appId ? { kind: "appSurface", nodeId: appId, appId } : null;
      }
      if (button.dataset.originKind === "node") {
        return button.dataset.originNodeId ? { kind: "node", nodeId: button.dataset.originNodeId } : null;
      }
      if (button.dataset.originKind === "featureGroup") {
        return button.dataset.originNodeId && button.dataset.originGroupId ? { kind: "featureGroup", nodeId: button.dataset.originNodeId, groupId: button.dataset.originGroupId } : null;
      }
      if (button.dataset.originKind === "featureItem") {
        return button.dataset.originNodeId && button.dataset.originGroupId && button.dataset.originItemId ? {
          kind: "featureItem",
          nodeId: button.dataset.originNodeId,
          groupId: button.dataset.originGroupId,
          itemId: button.dataset.originItemId
        } : null;
      }
      return null;
    }
    function endpointFromTargetButton(button) {
      if (button.dataset.targetKind === "projectOverview") {
        return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
      }
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
      return [endpoint.kind, endpointEntityId(endpoint), endpoint.groupId || "", endpoint.itemId || ""].map((part) => encodeURIComponent(part)).join("|");
    }
    function parseEndpointValue(value, fallbackEndpoint) {
      const [kind, entityId, groupId, itemId] = String(value || "").split("|").map((part) => decodeEndpointPart(part));
      return createEndpointFromParts(kind, entityId, groupId, itemId) || normalizeFallbackEndpoint(fallbackEndpoint);
    }
    function createEndpointFromParts(kind, entityId, groupId, itemId) {
      if (kind === "projectOverview") {
        return { kind, nodeId: PROJECT_OVERVIEW_NODE_ID };
      }
      if (!entityId) {
        return void 0;
      }
      if (kind === "appSurface") {
        return { kind, nodeId: entityId, appId: entityId };
      }
      if (kind === "node") {
        return { kind, nodeId: entityId };
      }
      if (kind === "featureGroup" && groupId) {
        return { kind, nodeId: entityId, groupId };
      }
      if (kind === "featureItem" && groupId && itemId) {
        return { kind, nodeId: entityId, groupId, itemId };
      }
      return void 0;
    }
    function normalizeFallbackEndpoint(endpoint) {
      if (!endpoint || typeof endpoint.kind !== "string") {
        return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
      }
      const entityId = endpointEntityId(endpoint);
      return createEndpointFromParts(endpoint.kind, entityId, endpoint.groupId || "", endpoint.itemId || "") || { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
    }
    function decodeEndpointPart(part) {
      try {
        return decodeURIComponent(part || "");
      } catch {
        return "";
      }
    }
    function endpointDisplayLabel(flow, endpoint) {
      if (endpoint.kind === "projectOverview") {
        return `\u9879\u76EE\u6982\u8FF0 \xB7 ${flow.title || "\u9879\u76EE\u6982\u8FF0"}`;
      }
      if (endpoint.kind === "appSurface") {
        const appId = endpointEntityId(endpoint);
        const surface = (flow.appSurfaces || []).find((item2) => item2.appId === appId);
        return `\u5E94\u7528\u7AEF\u5361\u7247 \xB7 ${surface?.name || appId || ""}`;
      }
      const node = flow.nodes.find((item2) => item2.nodeId === endpoint.nodeId);
      if (!node) {
        return endpoint.nodeId || "";
      }
      if (endpoint.kind === "node") {
        return `\u8282\u70B9\u5361\u7247 \xB7 ${node.title}`;
      }
      const group = getFeatureGroups(node).find((item2) => item2.groupId === endpoint.groupId);
      if (endpoint.kind === "featureGroup") {
        return `\u529F\u80FD\u5206\u7EC4 \xB7 ${group?.name || endpoint.groupId || ""}`;
      }
      const item = group?.items?.find((candidate) => candidate.itemId === endpoint.itemId);
      return `\u529F\u80FD\u9879 \xB7 ${item?.name || endpoint.itemId || ""}`;
    }
    function endpointEntityId(endpoint) {
      if (endpoint.kind === "projectOverview") {
        return PROJECT_OVERVIEW_NODE_ID;
      }
      return endpoint.kind === "appSurface" ? endpoint.appId || endpoint.nodeId || "" : endpoint.nodeId || "";
    }
    function endpointSearchText(parts) {
      return parts.filter(Boolean).join(" ").toLowerCase();
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
      if (value === "admin" || value === "backend" || value === "console" || value === "\u540E\u53F0" || value === "\u7BA1\u7406\u540E\u53F0") {
        return "admin";
      }
      if (value === "web" || value === "website" || value === "h5" || value === "\u7F51\u9875" || value === "web\u7AEF") {
        return "web";
      }
      if (value === "app" || value === "mobile" || value === "ios" || value === "android" || value === "\u79FB\u52A8\u7AEF" || value === "app\u7AEF") {
        return "app";
      }
      if (value === "miniapp" || value === "mini-app" || value === "miniprogram" || value === "\u5C0F\u7A0B\u5E8F") {
        return "miniapp";
      }
      if (value === "desktop" || value === "pc" || value === "\u684C\u9762\u7AEF" || value === "\u5BA2\u6237\u7AEF") {
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
      if (value === "popup" || value === "modal" || value === "dialog" || value === "\u5F39\u7A97") {
        return "popup";
      }
      if (value === "component" || value === "components" || value === "\u7EC4\u4EF6") {
        return "component";
      }
      if (value === "navigation" || value === "nav" || value === "menu" || value === "\u5BFC\u822A") {
        return "navigation";
      }
      if (value === "skeleton" || value === "wireframe" || value === "layout" || value === "\u9AA8\u67B6") {
        return "skeleton";
      }
      return "page";
    }
    function normalizeEdgeTypeForSelect(type) {
      const group = edgeTypeGroup(type);
      if (group === "status") return "statusChange";
      if (group === "nesting") return "nestedRelation";
      if (group === "auto") return "autoNavigate";
      if (group === "data") return "dataFlow";
      return "interaction";
    }
    function edgeTypeGroup(type) {
      if (type === "statusChange") {
        return "status";
      }
      if (type === "nestedRelation") {
        return "nesting";
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
      const edgesHtml = state.flow.edges.filter((edge) => edge.status === "active").map((edge) => renderEdge(edge)).join("");
      svg.innerHTML = `${renderProjectOverviewSystemEdges(state.flow)}${edgesHtml}${renderConnectionPreview()}`;
    }
    function renderProjectOverviewSystemEdges(flow) {
      return (flow.appSurfaces || []).map((surface) => renderProjectOverviewSystemEdge(surface)).join("");
    }
    function renderProjectOverviewSystemEdge(surface) {
      const from = getProjectOverviewAppSystemPoint(surface.appId);
      const to = getEndpointScreenPoint({ kind: "appSurface", nodeId: surface.appId, appId: surface.appId }, "to");
      if (!from || !to) {
        return "";
      }
      const curve = Math.max(70, Math.abs(to.x - from.x) * 0.42);
      const d = `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`;
      return `
    <g class="project-overview-system-edge">
      <path class="edge-path" d="${d}"></path>
    </g>
  `;
    }
    function getProjectOverviewAppSystemPoint(appId) {
      const dot = document.querySelector(`.project-overview-system-dot[data-project-overview-app-id="${cssEscape(appId)}"]`);
      const canvas = document.getElementById("canvas");
      if (!dot || !canvas) {
        return null;
      }
      const rect = dot.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - canvasRect.left,
        y: rect.top + rect.height / 2 - canvasRect.top,
        related: true
      };
    }
    function getAppSurfaceEntryNodes(flow, appId) {
      return flow.nodes.filter(
        (node) => node.status !== "removed" && nodeBelongsToAppSurface(node, appId) && isAppSurfaceEntryNode(flow, node, appId)
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
        element = document.querySelector(`.target-dot[data-target-key="${cssEscape(key)}"]`) || document.querySelector(`.target-dot[data-target-node-id="${cssEscape(endpoint.nodeId || "")}"]`) || element;
      }
      if (element) {
        const canvas = document.getElementById("canvas");
        if (!canvas) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        const card = element.closest(".node-card, .app-surface-card, .project-overview-card");
        const cardRect = card?.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const x = cardRect ? direction === "to" ? cardRect.left - 1 : cardRect.right + 1 : rect.left + rect.width / 2;
        return {
          x: x - canvasRect.left,
          y: rect.top + rect.height / 2 - canvasRect.top,
          related: !card?.classList.contains("dimmed")
        };
      }
      if (endpoint.kind === "projectOverview") {
        const pos2 = projectOverviewPosition;
        if (!pos2) {
          return null;
        }
        const x = direction === "to" ? pos2.x : pos2.x + PROJECT_OVERVIEW_WIDTH;
        return {
          ...worldToScreen({ x, y: pos2.y + 46 }),
          related: true
        };
      }
      if (endpoint.kind === "appSurface") {
        const appId = endpointEntityId(endpoint);
        const surface = (state.flow.appSurfaces || []).find((item) => item.appId === appId);
        const pos2 = appSurfacePositions.get(appId);
        if (!surface || !pos2) {
          return null;
        }
        return {
          ...worldToScreen({ x: pos2.x + CARD_WIDTH / 2, y: pos2.y + 70 }),
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
      const canvas = document.getElementById("canvas");
      if (!canvas) {
        return { x: 0, y: 0 };
      }
      const rect = canvas.getBoundingClientRect();
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
    function refreshCanvasAndNodeList() {
      const flow = state.flow;
      seedProjectOverviewPosition(flow);
      seedNodePositions(flow);
      seedAppSurfacePositions(flow);
      normalizeFilters();
      const activeNodes = flow.nodes.filter((node) => node.status !== "removed");
      const visibleListNodes = activeNodes.filter((node) => matchesNodeSearch(flow, node, nodeSearch));
      const world = document.getElementById("world");
      const nodeList = document.querySelector(".node-list");
      if (world) {
        world.innerHTML = `${renderProjectOverviewCard(flow)}${renderAppSurfaceSourceCards(flow)}${activeNodes.map((node) => renderNodeCard(flow, node)).join("")}`;
        applyStatusGroupColorSwatches(world);
      }
      if (nodeList) {
        nodeList.innerHTML = visibleListNodes.map((node) => renderNodeListItem(flow, node)).join("") || '<p class="empty">\u65E0\u5339\u914D\u8282\u70B9</p>';
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
      selectedProjectOverview = false;
      if (options.multi) {
        toggleNodeSelection(nodeId);
      } else {
        setSelectedNodes([nodeId], nodeId);
      }
      selectedEdgeId = "";
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = clearAllTaxonomySelections();
      if (selectedNodeId) {
        postWebviewMessage({ type: "selectNode", nodeId: selectedNodeId, selectedNodeIds });
      } else {
        postWebviewMessage({ type: "clearSelection" });
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
      selectedNodeId = selectedNodeIds.includes(primaryNodeId) ? primaryNodeId : selectedNodeIds[0] || "";
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
      selectedProjectOverview = false;
      selectedEdgeId = edgeId;
      clearNodeSelectionState();
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = clearAllTaxonomySelections();
      postWebviewMessage({ type: "selectEdge", edgeId });
      render();
      requestAnimationFrame(() => focusCanvas());
    }
    function selectAppSurface(appId) {
      selectedProjectOverview = false;
      selectedAppSurfaceId = appId;
      clearNodeSelectionState();
      selectedEdgeId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = {
        appSurface: appId,
        domain: "",
        role: "",
        statusGroup: ""
      };
      persistUiState();
      postWebviewMessage({ type: "selectAppSurface", appId });
      render();
      requestAnimationFrame(() => focusCanvas());
    }
    function selectStatusGroup(statusGroupId) {
      selectedProjectOverview = false;
      selectedStatusGroupId = statusGroupId;
      clearNodeSelectionState();
      selectedEdgeId = "";
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      taxonomySelection = {
        appSurface: "",
        domain: "",
        role: "",
        statusGroup: statusGroupId
      };
      persistUiState();
      postWebviewMessage({ type: "selectStatusGroup", statusGroupId });
      render();
      requestAnimationFrame(() => focusCanvas());
    }
    function selectProjectOverview() {
      selectedProjectOverview = true;
      clearNodeSelectionState();
      selectedEdgeId = "";
      selectedAppSurfaceId = "";
      selectedDomainId = "";
      selectedRoleId = "";
      selectedStatusGroupId = "";
      taxonomySelection = clearAllTaxonomySelections();
      persistUiState();
      postWebviewMessage({ type: "selectProjectOverview" });
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
          name: "\u9875\u9762\u5143\u7D20",
          type: "legacyElements",
          description: "\u7531\u9875\u9762\u5143\u7D20\u5B57\u6BB5\u517C\u5BB9\u5C55\u793A\u3002",
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
    function getEntryAppSurfaceNames(flow, node) {
      const entryIds = getEntryAppSurfaceIds(flow, node);
      if (entryIds.length === 0) {
        return "";
      }
      const surfaces = flow.appSurfaces || [];
      return entryIds.map((appId) => surfaces.find((surface) => surface.appId === appId)?.name || appId || "\u5168\u90E8\u5E94\u7528\u7AEF").join(" / ");
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
    function namesByIds(items, idKey, ids) {
      return ids.map((id) => items.find((item) => item[idKey] === id)?.name || id).filter(Boolean).join(" / ");
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
      const selectedSurfaces = appFilters.length > 0 ? (flow.appSurfaces || []).filter((item) => appFilters.includes(item.appId)) : [];
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
        role: normalizeTaxonomySelection(flow, "role", taxonomySelection.role),
        statusGroup: normalizeTaxonomySelection(flow, "statusGroup", taxonomySelection.statusGroup)
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
      if (selectedStatusGroupId && !getStatusGroup(flow, selectedStatusGroupId)) {
        selectedStatusGroupId = "";
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
    function isNodeRelatedByApp(node) {
      return appFilters.length === 0 || !Array.isArray(node.appSurfaceIds) || node.appSurfaceIds.length === 0 || intersects(node.appSurfaceIds, appFilters);
    }
    function endpointNode(endpoint) {
      return endpoint.kind === "appSurface" || endpoint.kind === "projectOverview" ? null : state.flow.nodes.find((node) => node.nodeId === endpoint.nodeId);
    }
    function endpointAppSurface(endpoint) {
      return endpoint.kind === "appSurface" ? (state.flow.appSurfaces || []).find((surface) => surface.appId === endpointEntityId(endpoint)) : null;
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
      const x = c * (1 - Math.abs(hue / 60 % 2 - 1));
      const m = l - c / 2;
      const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
      return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
    }
    function collectMultiSelect(id) {
      const select = document.getElementById(id);
      return Array.from(select?.selectedOptions || []).map((option) => option.value);
    }
    function collectTagMultiSelect(id) {
      return Array.from(document.querySelectorAll(`#${cssEscape(id)} input[type="checkbox"]:checked`)).map((input) => input.value);
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
        role: typeof value?.role === "string" ? value.role : "",
        statusGroup: typeof value?.statusGroup === "string" ? value.statusGroup : ""
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
    function handleHostMessage(message) {
      if (!message || message.type !== "commandResult") {
        return;
      }
      const replacementFlow = message.flow && typeof message.flow === "object" ? message.flow : null;
      if (replacementFlow) {
        state.flow = replacementFlow;
        resetLayoutCaches();
      }
      setCommandStatus(message.ok === true, typeof message.message === "string" ? message.message : "");
      if (replacementFlow) {
        render();
      } else {
        updateCommandStatusElement();
      }
    }
    function setCommandStatus(ok, message) {
      clearTimeout(commandStatusTimer);
      const statusMessage = String(message || "").trim();
      if (ok && !statusMessage) {
        commandStatus = null;
        persistUiState();
        return;
      }
      commandStatus = {
        kind: ok ? "ok" : "error",
        message: statusMessage || "\u64CD\u4F5C\u5931\u8D25\uFF0C\u6587\u6863\u672A\u66F4\u65B0\u3002",
        at: Date.now()
      };
      persistUiState();
      if (ok) {
        commandStatusTimer = setTimeout(() => {
          commandStatus = null;
          persistUiState();
          updateCommandStatusElement();
        }, 2600);
      }
    }
    function updateCommandStatusElement() {
      const existing = document.getElementById("commandStatus");
      if (!commandStatus) {
        existing?.remove();
        return;
      }
      const canvas = document.getElementById("canvas");
      if (!canvas) {
        return;
      }
      const container = existing || document.createElement("div");
      container.id = "commandStatus";
      container.className = `command-status ${commandStatus.kind}`;
      container.setAttribute("role", "status");
      container.textContent = commandStatus.message;
      if (!existing) {
        canvas.appendChild(container);
      }
    }
    function resetLayoutCaches() {
      nodePositions.clear();
      appSurfacePositions.clear();
      projectOverviewPosition = null;
    }
    function readCommandStatus(value) {
      if (!value || value.kind !== "ok" && value.kind !== "error" || typeof value.message !== "string") {
        return null;
      }
      const at = Number(value.at);
      if (!Number.isFinite(at)) {
        return null;
      }
      if (value.kind === "ok" && Date.now() - at > 3e3) {
        return null;
      }
      return {
        kind: value.kind,
        message: value.message,
        at
      };
    }
    function persistUiState() {
      vscode.setState({
        appFilters,
        domainFilters,
        roleFilters,
        taxonomyPanelsOpen,
        taxonomySelection,
        selectedProjectOverview,
        selectedNodeId,
        selectedNodeIds,
        selectedAppSurfaceId,
        selectedDomainId,
        selectedRoleId,
        selectedStatusGroupId,
        nodeSearch,
        leftPanelCollapsed,
        zoom,
        camera,
        connectingFrom,
        pendingEdgeDetailsSaves,
        inspectorScrollState,
        commandStatus
      });
    }
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }
    function cssEscape(value) {
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }
      return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
    }
    function escapeHtml(value) {
      return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function escapeAttr(value) {
      return escapeHtml(value).replace(/'/g, "&#39;");
    }
    reconcilePendingEdgeDetailsSaves();
    render();
  })();
})();
