import type { ProductFlow, ProductStatusGroup } from "../../product-flow";
import { makeTaxonomyId, readOptionalString, readString, requireRequestId, upsertById } from "./helpers";
import type { TaxonomyRequest } from "./types";

export function applyStatusGroupRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  flow.statusGroups = flow.statusGroups ?? [];
  if (request.action === "delete") {
    const statusGroupId = requireRequestId(request);
    flow.statusGroups = flow.statusGroups.filter((item) => item.statusGroupId !== statusGroupId);
    for (const node of flow.nodes) {
      if (node.statusGroupId === statusGroupId) {
        delete node.statusGroupId;
      }
    }
    return;
  }
  const item = request.item ?? {};
  const requestedStatusGroupId = request.id ?? readOptionalString(item.statusGroupId);
  const existing = requestedStatusGroupId ? flow.statusGroups.find((item) => item.statusGroupId === requestedStatusGroupId) : undefined;
  const title = readString(item.title ?? item.name, existing?.title ?? "新状态组");
  const statusGroupId = requestedStatusGroupId ?? makeTaxonomyId("status", title);
  const requestedColor = readStatusGroupColor(item.color, existing?.color ?? randomStatusGroupColor(flow.statusGroups, statusGroupId));
  const next: ProductStatusGroup = {
    statusGroupId,
    title,
    description: readString(item.description, ""),
    color: uniqueStatusGroupColor(requestedColor, flow.statusGroups, statusGroupId)
  };
  upsertById(flow.statusGroups, (item) => item.statusGroupId, next);
}

function readStatusGroupColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

function uniqueStatusGroupColor(color: string, groups: ProductStatusGroup[], currentId: string): string {
  return statusGroupColorExists(color, groups, currentId) ? randomStatusGroupColor(groups, currentId) : color;
}

function statusGroupColorExists(color: string, groups: ProductStatusGroup[], currentId: string): boolean {
  const normalized = color.toLowerCase();
  return groups.some((group) =>
    group.statusGroupId !== currentId &&
    readStatusGroupColor(group.color, "").toLowerCase() === normalized
  );
}

function randomStatusGroupColor(groups: ProductStatusGroup[] = [], currentId = ""): string {
  const usedColors = new Set(
    groups
      .filter((group) => group.statusGroupId !== currentId)
      .map((group) => readStatusGroupColor(group.color, "").toLowerCase())
      .filter(Boolean)
  );
  const hue = Math.floor(Math.random() * 360);
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const color = hslToHex((hue + attempt * 37) % 360, 68, 54);
    if (!usedColors.has(color)) {
      return color;
    }
  }
  return hslToHex(hue, 68, 54);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
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
