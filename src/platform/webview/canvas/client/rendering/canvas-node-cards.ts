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
