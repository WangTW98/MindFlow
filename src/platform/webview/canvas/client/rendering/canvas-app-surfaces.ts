// @ts-nocheck
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
