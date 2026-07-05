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
