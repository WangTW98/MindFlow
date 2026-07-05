function endpointFromButton(button) {
  if (button.dataset.originKind === "projectOverview") {
    return { kind: "projectOverview", nodeId: PROJECT_OVERVIEW_NODE_ID };
  }
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
  return [endpoint.kind, endpointEntityId(endpoint), endpoint.groupId || "", endpoint.itemId || ""]
    .map((part) => encodeURIComponent(part))
    .join("|");
}

function parseEndpointValue(value) {
  const [kind, entityId, groupId, itemId] = String(value || "")
    .split("|")
    .map((part) => decodeEndpointPart(part));
  const endpoint = kind === "appSurface"
    ? { kind, nodeId: entityId, appId: entityId }
    : kind === "projectOverview"
      ? { kind, nodeId: PROJECT_OVERVIEW_NODE_ID }
    : { kind, nodeId: entityId };
  if (groupId) {
    endpoint.groupId = groupId;
  }
  if (itemId) {
    endpoint.itemId = itemId;
  }
  return endpoint;
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
    return `项目概述 · ${flow.title || "项目概述"}`;
  }
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
  if (endpoint.kind === "projectOverview") {
    return PROJECT_OVERVIEW_NODE_ID;
  }
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
  if (value === "component" || value === "components" || value === "组件") {
    return "component";
  }
  if (value === "navigation" || value === "nav" || value === "menu" || value === "导航") {
    return "navigation";
  }
  if (value === "skeleton" || value === "wireframe" || value === "layout" || value === "骨架") {
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
