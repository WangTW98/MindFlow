// @ts-nocheck
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
