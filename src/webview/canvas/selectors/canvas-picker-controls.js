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
