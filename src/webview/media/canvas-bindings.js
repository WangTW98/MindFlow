function bindEvents() {
  const canvas = document.getElementById("canvas");
  const edgeLayer = document.getElementById("edgeLayer");
  const nodeSearchInput = document.getElementById("nodeSearch");
  const closeInspectorButton = document.getElementById("closeInspector");

  bindAction("collapseLeftPanel", () => {
    leftPanelCollapsed = true;
    render();
  });
  bindAction("expandLeftPanel", () => {
    leftPanelCollapsed = false;
    render();
  });
  if (nodeSearchInput) {
    nodeSearchInput.addEventListener("compositionstart", () => {
      nodeSearchComposing = true;
    });
    nodeSearchInput.addEventListener("compositionend", (event) => {
      nodeSearchComposing = false;
      nodeSearch = event.target.value;
      persistUiState();
      renderAfterNodeSearchInput();
    });
    nodeSearchInput.addEventListener("input", (event) => {
      nodeSearch = event.target.value;
      persistUiState();
      if (nodeSearchComposing || event.isComposing) {
        return;
      }
      renderAfterNodeSearchInput();
    });
    nodeSearchInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
  }
  if (closeInspectorButton) {
    closeInspectorButton.addEventListener("click", clearSelection);
  }
  const inspector = document.querySelector(".inspector");
  if (inspector) {
    inspector.addEventListener("scroll", persistCurrentInspectorScroll, { passive: true });
  }

  bindTaxonomyPanelToggles(document);
  bindTaxonomyControls(document);
  applyEdgeTypeColorSwatches(document);
  applyStatusGroupColorSwatches(document);

  bindCanvasElements();

  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("pointerdown", startPan);
  canvas.addEventListener("pointermove", movePan);
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener("click", handleCanvasClick);
  document.oncontextmenu = handleContextMenu;
  document.onkeydown = handleKeyDown;

  edgeLayer.addEventListener("click", (event) => {
    const endpoint = event.target.closest(".edge-endpoint");
    if (endpoint) {
      event.stopPropagation();
      const edgeId = endpoint.dataset.edgeId;
      if (edgeId) {
        selectEdge(edgeId);
      }
      return;
    }
    const edgeTarget = event.target.closest("[data-edge-id]");
    if (edgeTarget) {
      event.stopPropagation();
      const edgeId = edgeTarget.dataset.edgeId;
      if (edgeId) {
        selectEdge(edgeId);
      }
    }
  });

  const nodeForm = document.getElementById("nodeDetailsForm");
  if (nodeForm) {
    bindNodeInspector(nodeForm);
  }
  const projectOverviewForm = document.getElementById("projectOverviewDetailsForm");
  if (projectOverviewForm) {
    bindProjectOverviewInspector(projectOverviewForm);
  }
  const appSurfaceForm = document.getElementById("appSurfaceDetailsForm");
  if (appSurfaceForm) {
    bindAppSurfaceInspector(appSurfaceForm);
  }
  const domainForm = document.getElementById("domainDetailsForm");
  if (domainForm) {
    bindDomainInspector(domainForm);
  }
  const roleForm = document.getElementById("roleDetailsForm");
  if (roleForm) {
    bindRoleInspector(roleForm);
  }
  const statusGroupForm = document.getElementById("statusGroupDetailsForm");
  if (statusGroupForm) {
    bindStatusGroupInspector(statusGroupForm);
  }
  const edgeForm = document.getElementById("edgeDetailsForm");
  if (edgeForm) {
    bindEdgeInspector(edgeForm);
  }
}

function bindAction(id, handler) {
  const button = document.getElementById(id);
  if (!button) {
    return;
  }
  button.addEventListener("click", handler);
}

function renderAfterNodeSearchInput() {
  render();
  requestAnimationFrame(() => {
    const nextInput = document.getElementById("nodeSearch");
    if (nextInput) {
      nextInput.focus({ preventScroll: true });
      nextInput.setSelectionRange(nodeSearch.length, nodeSearch.length);
    }
  });
}

function bindInlineTitleEditor(titleId, inputId, commit) {
  const title = document.getElementById(titleId);
  const input = document.getElementById(inputId);
  if (!title || !input) {
    return;
  }
  title.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    startInlineTitleEdit(title, input, commit);
  });
  title.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (title.dataset.inlineEditing === "true") {
      return;
    }
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startInlineTitleEdit(title, input, commit);
    }
  });
}

function startInlineTitleEdit(title, input, commit) {
  if (title.dataset.inlineEditing === "true") {
    return;
  }
  const original = normalizeInlineTitleText(input.value || title.textContent);
  let finished = false;
  title.dataset.inlineEditing = "true";
  title.setAttribute("contenteditable", "true");
  title.setAttribute("role", "textbox");
  title.classList.add("editing");
  title.textContent = original;

  const finish = (save) => {
    if (finished) {
      return;
    }
    finished = true;
    title.removeEventListener("blur", handleBlur);
    title.removeEventListener("keydown", handleKeydown);
    const next = save ? normalizeInlineTitleText(title.textContent) || original : original;
    input.value = next;
    title.textContent = next;
    title.removeAttribute("contenteditable");
    title.removeAttribute("role");
    title.classList.remove("editing");
    delete title.dataset.inlineEditing;
    if (save && next !== original) {
      commit();
    }
  };

  const handleBlur = () => finish(true);
  const handleKeydown = (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
      title.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      title.blur();
    }
  };

  title.addEventListener("blur", handleBlur);
  title.addEventListener("keydown", handleKeydown);
  requestAnimationFrame(() => {
    title.focus({ preventScroll: true });
    selectInlineTitleText(title);
  });
}

function normalizeInlineTitleText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function selectInlineTitleText(element) {
  const selection = window.getSelection?.();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

function bindCanvasElements(root = document) {
  const projectOverviewCards = root.matches?.(".project-overview-card")
    ? [root]
    : Array.from(root.querySelectorAll(".project-overview-card"));
  projectOverviewCards.forEach((card) => {
    card.addEventListener("pointerdown", startProjectOverviewDrag);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, textarea, select")) {
        return;
      }
      if (!dragState) {
        selectProjectOverview();
      }
    });
  });

  root.querySelectorAll(".node-list-item").forEach((button) => {
    button.addEventListener("click", (event) => {
      const nodeId = button.dataset.listNodeId;
      if (nodeId) {
        const multi = isNodeMultiSelectEvent(event);
        if (multi) {
          event.preventDefault();
        }
        selectNode(nodeId, true, { multi });
      }
    });
  });

  root.querySelectorAll(".node-card").forEach((card) => {
    card.addEventListener("pointerdown", startNodeDrag);
    card.addEventListener("click", (event) => {
      if (suppressNextNodeCardClick) {
        suppressNextNodeCardClick = false;
        suppressNextCanvasClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target.closest("button, input, textarea, select")) {
        return;
      }
      const nodeId = card.dataset.nodeId;
      if (nodeId && !dragState) {
        const multi = isNodeMultiSelectEvent(event);
        if (multi) {
          event.preventDefault();
        }
        selectNode(nodeId, false, { multi });
      }
    });
  });

  root.querySelectorAll(".app-surface-card").forEach((card) => {
    card.addEventListener("pointerdown", startAppSurfaceDrag);
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, textarea, select")) {
        return;
      }
      const appId = card.dataset.appSurfaceId;
      if (appId && !dragState) {
        selectAppSurface(appId);
      }
    });
  });

  root.querySelectorAll(".origin-dot").forEach((button) => {
    button.addEventListener("pointerdown", (event) => startConnectionDrag(event, "from", endpointFromButton(button), button));
  });

  root.querySelectorAll(".target-dot").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      const endpoint = endpointFromTargetButton(button);
      if (endpoint) {
        startConnectionDrag(event, "to", endpoint, button);
      }
    });
  });
}

function bindTaxonomyPanelToggles(root = document) {
  root.querySelectorAll("[data-taxonomy-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const kind = button.dataset.taxonomyToggle;
      if (!kind) {
        return;
      }
      taxonomyPanelsOpen = {
        ...taxonomyPanelsOpen,
        [kind]: taxonomyPanelsOpen[kind] !== true
      };
      persistUiState();
      render();
      requestAnimationFrame(() => focusCanvas());
    });
  });
}

function bindTaxonomyControls(root = document) {
  root.querySelectorAll(".taxonomy-filter-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      setFilterSelection(checkbox.dataset.kind, checkbox.value, checkbox.checked);
      render();
    });
    checkbox.addEventListener("click", (event) => event.stopPropagation());
  });

  root.querySelectorAll(".managed-list-item").forEach((item) => {
    item.addEventListener("pointerdown", (event) => event.stopPropagation());
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      selectTaxonomyItem(item.dataset.kind, item.dataset.taxonomyId);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        selectTaxonomyItem(item.dataset.kind, item.dataset.taxonomyId);
      }
    });
  });

  root.querySelectorAll(".taxonomy-action").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      manageTaxonomy(button.dataset.kind, button.dataset.action, button.dataset.taxonomyId);
    });
  });
}

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

function setFilterSelection(kind, id, checked) {
  const list = getFilterSelection(kind);
  if (checked && !list.includes(id)) {
    list.push(id);
  } else if (!checked) {
    const index = list.indexOf(id);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }
  normalizeFilters();
}

function getFilterSelection(kind) {
  if (kind === "appSurface") {
    return appFilters;
  }
  if (kind === "domain") {
    return domainFilters;
  }
  if (kind === "statusGroup") {
    return [];
  }
  return roleFilters;
}

function selectTaxonomyItem(kind, id) {
  if (!kind || !id) {
    return;
  }
  selectedProjectOverview = false;
  if (kind === "statusGroup") {
    selectStatusGroup(id);
    return;
  }
  if (kind === "appSurface") {
    selectAppSurface(id);
    return;
  }
  clearNodeSelectionState();
  selectedEdgeId = "";
  selectedAppSurfaceId = "";
  selectedStatusGroupId = "";
  if (kind === "domain") {
    selectedDomainId = id;
    selectedRoleId = "";
    taxonomySelection = {
      appSurface: "",
      domain: id,
      role: "",
      statusGroup: ""
    };
    vscode.postMessage({ type: "selectDomain", domainId: id });
  } else {
    selectedDomainId = "";
    selectedRoleId = id;
    taxonomySelection = {
      appSurface: "",
      domain: "",
      role: id,
      statusGroup: ""
    };
    vscode.postMessage({ type: "selectRole", roleId: id });
  }
  persistUiState();
  render();
  requestAnimationFrame(() => focusCanvas());
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

function bindFeatureEditor() {
  const editor = document.getElementById("featureEditor");
  const addGroup = document.getElementById("addFeatureGroup");
  if (!editor || !addGroup) {
    return;
  }
  addGroup.addEventListener("click", () => {
    const groups = collectFeatureGroups();
    groups.push({
      groupId: makeClientId("group"),
      name: "新功能分组",
      type: "section",
      description: "",
      items: []
    });
    rerenderFeatureEditor(groups);
    commitNodeDetailsChange({ immediate: true });
  });
  editor.addEventListener("click", (event) => {
    const addItem = event.target.closest(".add-feature-item");
    const deleteGroup = event.target.closest(".delete-feature-group");
    const deleteItem = event.target.closest(".delete-feature-item");
    const groups = collectFeatureGroups();
    if (addItem) {
      const groupIndex = Number(addItem.dataset.groupIndex);
      groups[groupIndex]?.items.push({
        itemId: makeClientId("item"),
        name: "新功能项",
        type: "text",
        description: "",
        required: false
      });
      rerenderFeatureEditor(groups);
      commitNodeDetailsChange({ immediate: true });
    } else if (deleteGroup) {
      groups.splice(Number(deleteGroup.dataset.groupIndex), 1);
      rerenderFeatureEditor(groups);
      commitNodeDetailsChange({ immediate: true });
    } else if (deleteItem) {
      const group = groups[Number(deleteItem.dataset.groupIndex)];
      if (group) {
        group.items.splice(Number(deleteItem.dataset.itemIndex), 1);
        rerenderFeatureEditor(groups);
        commitNodeDetailsChange({ immediate: true });
      }
    }
  });
  editor.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".drag-handle");
    if (!handle) {
      return;
    }
    event.preventDefault();
    startFeatureSort(event, handle);
  });
}

function rerenderFeatureEditor(groups) {
  const editor = document.getElementById("featureEditor");
  if (!editor) {
    return;
  }
  editor.innerHTML = renderFeatureEditorGroups(groups);
}

function startFeatureSort(event, handle) {
  const kind = handle.dataset.dragKind;
  const row = kind === "group" ? handle.closest(".feature-edit-group") : handle.closest(".feature-edit-item");
  const container = kind === "group" ? document.getElementById("featureEditor") : row?.closest(".feature-edit-items");
  if (!row || !container) {
    return;
  }
  featureDrag = {
    kind,
    pointerId: event.pointerId,
    handle,
    row,
    container,
    startY: event.clientY,
    lastY: event.clientY
  };
  row.classList.add("sorting");
  container.classList.add("sorting-container");
  handle.setPointerCapture(event.pointerId);
  handle.addEventListener("pointermove", moveFeatureSort);
  handle.addEventListener("pointerup", endFeatureSort);
  handle.addEventListener("pointercancel", cancelFeatureSort);
}

function moveFeatureSort(event) {
  if (!featureDrag || event.pointerId !== featureDrag.pointerId) {
    return;
  }
  event.preventDefault();
  const containerRect = featureDrag.container.getBoundingClientRect();
  const rowRect = featureDrag.row.getBoundingClientRect();
  const minY = containerRect.top + rowRect.height / 2;
  const maxY = containerRect.bottom - rowRect.height / 2;
  const pointerY = clamp(event.clientY, minY, maxY);
  const delta = pointerY - featureDrag.startY;
  featureDrag.row.style.transform = `translateY(${delta}px)`;
  featureDrag.lastY = pointerY;
  reorderFeatureSortRow(pointerY);
}

function reorderFeatureSortRow(pointerY) {
  if (!featureDrag) {
    return;
  }
  const selector = featureDrag.kind === "group" ? ".feature-edit-group" : ".feature-edit-item";
  const siblings = Array.from(featureDrag.container.querySelectorAll(`:scope > ${selector}`))
    .filter((item) => item !== featureDrag.row);
  const before = siblings.find((item) => {
    const rect = item.getBoundingClientRect();
    return pointerY < rect.top + rect.height / 2;
  }) || null;
  if (before !== featureDrag.row.nextElementSibling) {
    featureDrag.container.insertBefore(featureDrag.row, before);
    featureDrag.startY = pointerY;
    featureDrag.row.style.transform = "translateY(0)";
    refreshFeatureEditorIndices();
  }
}

function endFeatureSort(event) {
  if (!featureDrag || event.pointerId !== featureDrag.pointerId) {
    return;
  }
  finishFeatureSort();
  commitNodeDetailsChange({ immediate: true });
}

function cancelFeatureSort(event) {
  if (!featureDrag || event.pointerId !== featureDrag.pointerId) {
    return;
  }
  finishFeatureSort();
}

function finishFeatureSort() {
  const drag = featureDrag;
  if (!drag) {
    return;
  }
  drag.row.classList.remove("sorting");
  drag.row.style.transform = "";
  drag.container.classList.remove("sorting-container");
  drag.handle.removeEventListener("pointermove", moveFeatureSort);
  drag.handle.removeEventListener("pointerup", endFeatureSort);
  drag.handle.removeEventListener("pointercancel", cancelFeatureSort);
  try {
    drag.handle.releasePointerCapture(drag.pointerId);
  } catch {
    // Pointer capture can be released by the webview before pointerup.
  }
  featureDrag = null;
  refreshFeatureEditorIndices();
}

function refreshFeatureEditorIndices() {
  document.querySelectorAll(".feature-edit-group").forEach((groupEl, groupIndex) => {
    groupEl.dataset.groupIndex = String(groupIndex);
    groupEl.querySelector(".feature-edit-group-head")?.setAttribute("data-group-index", String(groupIndex));
    groupEl.querySelectorAll("[data-group-index]").forEach((element) => {
      element.dataset.groupIndex = String(groupIndex);
    });
    groupEl.querySelectorAll(".feature-edit-item").forEach((itemEl, itemIndex) => {
      itemEl.dataset.groupIndex = String(groupIndex);
      itemEl.dataset.itemIndex = String(itemIndex);
      itemEl.querySelectorAll("[data-group-index]").forEach((element) => {
        element.dataset.groupIndex = String(groupIndex);
      });
      itemEl.querySelectorAll("[data-item-index]").forEach((element) => {
        element.dataset.itemIndex = String(itemIndex);
      });
    });
  });
}

function collectFeatureGroups() {
  return Array.from(document.querySelectorAll(".feature-edit-group")).map((groupEl) => ({
    groupId: groupEl.dataset.groupId || makeClientId("group"),
    name: groupEl.querySelector(".group-name").value.trim() || "未命名分组",
    type: groupEl.querySelector(".group-type").value.trim() || "section",
    description: groupEl.querySelector(".group-description").value.trim(),
    items: Array.from(groupEl.querySelectorAll(".feature-edit-item")).map((itemEl) => ({
      itemId: itemEl.dataset.itemId || makeClientId("item"),
      name: itemEl.querySelector(".item-name").value.trim() || "未命名功能项",
      type: itemEl.querySelector(".item-type").value.trim() || "text",
      description: itemEl.querySelector(".item-description").value.trim(),
      required: itemEl.dataset.itemRequired === "true"
    }))
  }));
}

function manageTaxonomy(kind, action, targetId = "") {
  if (!kind || !action) {
    return;
  }
  const flow = state.flow;
  const currentId = action === "create" ? "" : targetId || getSelectedTaxonomyId(kind) || taxonomySelection[kind] || "";
  const current = getTaxonomyItems(flow, kind).find((item) => getTaxonomyId(kind, item) === currentId);
  if (action === "create") {
    const item = createDefaultTaxonomyItem(flow, kind);
    const id = getTaxonomyId(kind, item);
    addTaxonomyItemLocally(flow, kind, item);
    selectTaxonomyItem(kind, id);
    vscode.postMessage({ type: "updateTaxonomy", request: { kind, action, id, item } });
    return;
  }
  if (!current) {
    return;
  }
  if (action === "delete") {
    clearTaxonomySelection(kind, currentId);
    removeTaxonomyItemLocally(flow, kind, currentId);
    vscode.postMessage({ type: "updateTaxonomy", request: { kind, action, id: currentId } });
    render();
    return;
  }
}

function createDefaultTaxonomyItem(flow, kind) {
  const index = getTaxonomyItems(flow, kind).length + 1;
  if (kind === "appSurface") {
    return {
      appId: makeClientId("app"),
      name: `新应用端 ${index}`,
      type: "other",
      description: "",
      domainIds: [],
      roleIds: []
    };
  }
  if (kind === "domain") {
    return {
      domainId: makeClientId("domain"),
      name: `新业务域 ${index}`,
      description: ""
    };
  }
  if (kind === "statusGroup") {
    return {
      statusGroupId: makeClientId("status"),
      title: `新状态组 ${index}`,
      description: "",
      color: randomStatusGroupColor(getStatusGroups(flow))
    };
  }
  return {
    roleId: makeClientId("role"),
    name: `新角色 ${index}`,
    description: "",
    domainIds: []
  };
}

function addTaxonomyItemLocally(flow, kind, item) {
  if (kind === "appSurface") {
    flow.appSurfaces = flow.appSurfaces || [];
    flow.appSurfaces.push(item);
    seedAppSurfacePositions(flow);
  } else if (kind === "domain") {
    flow.domains = flow.domains || [];
    flow.domains.push(item);
  } else if (kind === "role") {
    flow.roles = flow.roles || [];
    flow.roles.push(item);
  } else if (kind === "statusGroup") {
    flow.statusGroups = flow.statusGroups || [];
    flow.statusGroups.push(item);
  }
}

function removeTaxonomyItemLocally(flow, kind, id) {
  if (kind === "appSurface") {
    flow.appSurfaces = (flow.appSurfaces || []).filter((item) => item.appId !== id);
    flow.nodes.forEach((node) => {
      node.appSurfaceIds = (node.appSurfaceIds || []).filter((appId) => appId !== id);
    });
    flow.edges = flow.edges.filter((edge) => {
      if (edgeReferencesAppSurfaceEndpoint(edge, id)) {
        return false;
      }
      edge.appSurfaceIds = (edge.appSurfaceIds || []).filter((appId) => appId !== id);
      return true;
    });
    appSurfacePositions.delete(id);
  } else if (kind === "domain") {
    flow.domains = (flow.domains || []).filter((item) => item.domainId !== id);
  } else if (kind === "role") {
    flow.roles = (flow.roles || []).filter((item) => item.roleId !== id);
  } else if (kind === "statusGroup") {
    flow.statusGroups = (flow.statusGroups || []).filter((item) => item.statusGroupId !== id);
    flow.nodes.forEach((node) => {
      if (node.statusGroupId === id) {
        delete node.statusGroupId;
      }
    });
  }
}

function edgeReferencesAppSurfaceEndpoint(edge, appId) {
  return endpointReferencesAppSurface(edge.from, appId) ||
    endpointReferencesAppSurface(edge.to, appId) ||
    (!edge.from && edge.fromNodeId === appId) ||
    (!edge.to && edge.toNodeId === appId);
}

function endpointReferencesAppSurface(endpoint, appId) {
  return Boolean(endpoint && endpoint.kind === "appSurface" && endpointEntityId(endpoint) === appId);
}

function clearTaxonomySelection(kind, id) {
  taxonomySelection = {
    ...taxonomySelection,
    [kind]: ""
  };
  const list = getFilterSelection(kind);
  const index = list.indexOf(id);
  if (index >= 0) {
    list.splice(index, 1);
  }
  if (kind === "appSurface" && selectedAppSurfaceId === id) {
    selectedAppSurfaceId = "";
  }
  if (kind === "domain" && selectedDomainId === id) {
    selectedDomainId = "";
  }
  if (kind === "role" && selectedRoleId === id) {
    selectedRoleId = "";
  }
  if (kind === "statusGroup" && selectedStatusGroupId === id) {
    selectedStatusGroupId = "";
  }
  persistUiState();
}

