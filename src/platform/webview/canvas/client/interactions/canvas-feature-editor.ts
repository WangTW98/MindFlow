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
  const siblings: any[] = Array.from(featureDrag.container.querySelectorAll(`:scope > ${selector}`))
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
