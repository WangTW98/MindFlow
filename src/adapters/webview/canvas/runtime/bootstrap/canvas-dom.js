function requireElementById(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`MindFlow webview missing required element: #${id}`);
  }
  return element;
}

function requireInputValue(id) {
  const element = requireElementById(id);
  return typeof element.value === "string" ? element.value : "";
}
