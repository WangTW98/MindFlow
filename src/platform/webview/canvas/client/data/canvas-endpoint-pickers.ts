// @ts-nocheck
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
