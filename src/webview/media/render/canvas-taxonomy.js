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
