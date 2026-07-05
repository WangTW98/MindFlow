function bindProjectOverviewInspector(projectOverviewForm) {
  bindInlineTitleEditor("projectOverviewPanelTitle", "projectOverviewTitle", () => commitProjectOverviewDetailsChange({ immediate: true }));
  projectOverviewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitProjectOverviewDetailsChange({ immediate: true });
  });
  projectOverviewForm.addEventListener("input", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitProjectOverviewDetailsChange({ localOnly: true });
  });
  projectOverviewForm.addEventListener("change", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitProjectOverviewDetailsChange({ immediate: true });
  });
}

function bindNodeInspector(nodeForm) {
  bindInlineTitleEditor("nodePanelTitle", "nodeTitle", () => commitNodeDetailsChange({ immediate: true }));
  nodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitNodeDetailsChange({ immediate: true });
  });
  nodeForm.addEventListener("input", (event) => {
    if (event.target.closest(".drag-handle, .inline-title-editor")) {
      return;
    }
    commitNodeDetailsChange({ localOnly: true });
  });
  nodeForm.addEventListener("change", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitNodeDetailsChange({ immediate: true });
  });
  nodeForm.querySelectorAll(".page-type-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => togglePageTypePicker(trigger));
    trigger.addEventListener("keydown", (event) => event.stopPropagation());
  });
  nodeForm.querySelectorAll(".page-type-picker").forEach((picker) => {
    picker.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!picker.contains(document.activeElement)) {
          closePageTypePicker(picker);
        }
      }, 0);
    });
  });
  nodeForm.querySelectorAll(".page-type-option").forEach((option) => {
    option.addEventListener("click", () => selectPageTypeOption(option));
  });
  nodeForm.querySelectorAll(".status-group-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => toggleStatusGroupPicker(trigger));
    trigger.addEventListener("keydown", (event) => event.stopPropagation());
  });
  nodeForm.querySelectorAll(".status-group-picker").forEach((picker) => {
    picker.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!picker.contains(document.activeElement)) {
          closeStatusGroupPicker(picker);
        }
      }, 0);
    });
  });
  nodeForm.querySelectorAll(".status-group-option").forEach((option) => {
    option.addEventListener("click", () => selectStatusGroupOption(option));
  });
  bindFeatureEditor();
}

function bindAppSurfaceInspector(appSurfaceForm) {
  bindInlineTitleEditor("appSurfacePanelTitle", "appSurfaceName", () => commitAppSurfaceDetailsChange({ immediate: true }));
  appSurfaceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitAppSurfaceDetailsChange({ immediate: true });
  });
  appSurfaceForm.addEventListener("input", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitAppSurfaceDetailsChange({ localOnly: true });
  });
  appSurfaceForm.addEventListener("change", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitAppSurfaceDetailsChange({ immediate: true });
  });
  appSurfaceForm.querySelectorAll(".app-surface-type-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => toggleAppSurfaceTypePicker(trigger));
    trigger.addEventListener("keydown", (event) => event.stopPropagation());
  });
  appSurfaceForm.querySelectorAll(".app-surface-type-picker").forEach((picker) => {
    picker.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!picker.contains(document.activeElement)) {
          closeAppSurfaceTypePicker(picker);
        }
      }, 0);
    });
  });
  appSurfaceForm.querySelectorAll(".app-surface-type-option").forEach((option) => {
    option.addEventListener("click", () => selectAppSurfaceTypeOption(option));
  });
}

function bindDomainInspector(domainForm) {
  bindInlineTitleEditor("domainPanelTitle", "domainName", () => commitDomainDetailsChange({ immediate: true }));
  domainForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitDomainDetailsChange({ immediate: true });
  });
  domainForm.addEventListener("input", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitDomainDetailsChange({ localOnly: true });
  });
  domainForm.addEventListener("change", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitDomainDetailsChange({ immediate: true });
  });
}

function bindRoleInspector(roleForm) {
  bindInlineTitleEditor("rolePanelTitle", "roleName", () => commitRoleDetailsChange({ immediate: true }));
  roleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitRoleDetailsChange({ immediate: true });
  });
  roleForm.addEventListener("input", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitRoleDetailsChange({ localOnly: true });
  });
  roleForm.addEventListener("change", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitRoleDetailsChange({ immediate: true });
  });
}

function bindStatusGroupInspector(statusGroupForm) {
  bindInlineTitleEditor("statusGroupPanelTitle", "statusGroupTitle", () => commitStatusGroupDetailsChange({ immediate: true }));
  statusGroupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    commitStatusGroupDetailsChange({ immediate: true });
  });
  statusGroupForm.addEventListener("input", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitStatusGroupDetailsChange({ localOnly: true });
  });
  statusGroupForm.addEventListener("change", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    commitStatusGroupDetailsChange({ immediate: true });
  });
}

function bindEdgeInspector(edgeForm) {
  bindInlineTitleEditor("edgePanelTitle", "edgeTriggerRule", () => submitEdgeDetails({ immediate: true }));
  edgeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitEdgeDetails({ immediate: true });
  });
  edgeForm.addEventListener("change", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    if (event.target.closest(".endpoint-combobox")) {
      return;
    }
    submitEdgeDetails({ immediate: true });
  });
  edgeForm.addEventListener("input", (event) => {
    if (event.target.closest(".inline-title-editor")) {
      return;
    }
    if (event.target.closest(".endpoint-combobox")) {
      filterEndpointOptions(event.target);
      return;
    }
    submitEdgeDetails({ localOnly: true });
  });
  edgeForm.querySelectorAll(".endpoint-combobox-input").forEach((input) => {
    input.addEventListener("focus", () => {
      input.select();
      openEndpointPicker(input, true);
    });
    input.addEventListener("click", () => openEndpointPicker(input, true));
    input.addEventListener("keydown", (event) => event.stopPropagation());
  });
  edgeForm.querySelectorAll(".endpoint-picker").forEach((picker) => {
    picker.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!picker.contains(document.activeElement)) {
          closeEndpointPicker(picker);
        }
      }, 0);
    });
  });
  edgeForm.querySelectorAll(".endpoint-option").forEach((option) => {
    option.addEventListener("click", () => selectEndpointOption(option));
  });
  edgeForm.querySelectorAll(".edge-type-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => toggleEdgeTypePicker(trigger));
    trigger.addEventListener("keydown", (event) => event.stopPropagation());
  });
  edgeForm.querySelectorAll(".edge-type-picker").forEach((picker) => {
    picker.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!picker.contains(document.activeElement)) {
          closeEdgeTypePicker(picker);
        }
      }, 0);
    });
  });
  edgeForm.querySelectorAll(".edge-type-option").forEach((option) => {
    option.addEventListener("click", () => selectEdgeTypeOption(option));
  });
}
