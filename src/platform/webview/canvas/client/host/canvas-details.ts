// @ts-nocheck
function isEditingTarget(target) {
  return Boolean(target && typeof target.closest === "function" && target.closest("input, textarea, select, [contenteditable='true']"));
}
