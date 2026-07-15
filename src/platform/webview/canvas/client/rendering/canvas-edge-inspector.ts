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
      ${renderEndpointPicker("edgeFromEndpoint", "起点", flow, edge.from, true)}
      ${renderEndpointPicker("edgeToEndpoint", "终点", flow, edge.to, false)}
      ${renderEdgeTypePicker(selectedType)}
      <label>条件描述
        <textarea id="edgeCondition" rows="3">${escapeHtml(edge.condition || "")}</textarea>
      </label>
      <p class="field-hint">应用端、业务域和角色由连线端点自动派生。</p>
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
