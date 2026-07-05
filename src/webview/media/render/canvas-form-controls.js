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
