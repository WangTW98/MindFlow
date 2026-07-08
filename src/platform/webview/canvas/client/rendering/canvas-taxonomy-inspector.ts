// @ts-nocheck
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
