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
