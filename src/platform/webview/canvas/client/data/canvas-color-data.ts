// @ts-nocheck
function normalizeStatusGroupColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(color || "").trim()) ? String(color).trim() : "#6b7280";
}

function applyStatusGroupColorSwatches(root = document) {
  root.querySelectorAll(".status-group-color-square[data-status-group-color]").forEach((swatch) => {
    const color = normalizeStatusGroupColor(swatch.dataset.statusGroupColor);
    swatch.style.backgroundColor = color;
    swatch.style.borderColor = color;
  });
}

function applyEdgeTypeColorSwatches(root = document) {
  root.querySelectorAll(".edge-type-swatch[data-edge-type-color]").forEach((swatch) => {
    const color = String(swatch.dataset.edgeTypeColor || "").trim() || "var(--vscode-charts-blue, #3794ff)";
    swatch.style.background = color;
    swatch.style.borderColor = color;
  });
}

function randomStatusGroupColor(existingGroups = []) {
  const usedColors = new Set(existingGroups.map((group) => normalizeStatusGroupColor(group.color).toLowerCase()));
  const hue = Math.floor(Math.random() * 360);
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const color = hslToHex((hue + attempt * 37) % 360, 68, 54);
    if (!usedColors.has(color)) {
      return color;
    }
  }
  return hslToHex(hue, 68, 54);
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60
    ? [c, x, 0]
    : hue < 120
      ? [x, c, 0]
      : hue < 180
        ? [0, c, x]
        : hue < 240
          ? [0, x, c]
          : hue < 300
            ? [x, 0, c]
            : [c, 0, x];
  return `#${[r, g, b].map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}
