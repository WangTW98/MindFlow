import type {
  AppSurface,
  BusinessDomain,
  ProductFlow,
  ProductStatusGroup,
  UserRole
} from "../models/productFlow";
import { shortHash, slugify, nowIso } from "../utils/id";
import { deleteAppSurface } from "./taxonomyEditing";

export type TaxonomyKind = "appSurface" | "domain" | "role" | "statusGroup";
export type TaxonomyAction = "create" | "update" | "delete";

export interface TaxonomyRequest {
  kind: TaxonomyKind;
  action: TaxonomyAction;
  id?: string;
  item?: Record<string, unknown>;
}

export function applyTaxonomyRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  switch (request.kind) {
    case "appSurface":
      applyAppSurfaceRequest(flow, request);
      break;
    case "domain":
      applyDomainRequest(flow, request);
      break;
    case "role":
      applyRoleRequest(flow, request);
      break;
    case "statusGroup":
      applyStatusGroupRequest(flow, request);
      break;
    default:
      throw new Error(`Unsupported taxonomy kind: ${String(request.kind)}`);
  }
  flow.revision += 1;
  flow.updatedAt = nowIso();
}

function applyAppSurfaceRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  flow.appSurfaces = flow.appSurfaces ?? [];
  if (request.action === "delete") {
    const appId = requireRequestId(request);
    deleteAppSurface(flow, appId);
    return;
  }
  const item = request.item ?? {};
  const requestedAppId = request.id ?? readOptionalString(item.appId);
  const existing = requestedAppId ? flow.appSurfaces.find((item) => item.appId === requestedAppId) : undefined;
  const name = readString(item.name, existing?.name ?? "新应用端");
  const appId = requestedAppId ?? makeTaxonomyId("app", name);
  const next: AppSurface = {
    appId,
    name,
    type: normalizeSurfaceType(readString(item.type, "other")),
    description: readString(item.description, ""),
    domainIds: knownOnly(readStringArray(item.domainIds), new Set(flow.domains.map((domain) => domain.domainId))),
    roleIds: knownOnly(readStringArray(item.roleIds), new Set(flow.roles.map((role) => role.roleId))),
    view: existing?.view
  };
  upsertById(flow.appSurfaces, (item) => item.appId, next);
}

function applyDomainRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  if (request.action === "delete") {
    const domainId = requireRequestId(request);
    flow.domains = flow.domains.filter((item) => item.domainId !== domainId);
    for (const role of flow.roles) {
      role.domainIds = role.domainIds.filter((id) => id !== domainId);
    }
    for (const app of flow.appSurfaces ?? []) {
      app.domainIds = app.domainIds.filter((id) => id !== domainId);
    }
    for (const node of flow.nodes) {
      node.domainIds = node.domainIds.filter((id) => id !== domainId);
    }
    for (const edge of flow.edges) {
      edge.domainIds = edge.domainIds.filter((id) => id !== domainId);
    }
    return;
  }
  const item = request.item ?? {};
  const requestedDomainId = request.id ?? readOptionalString(item.domainId);
  const existing = requestedDomainId ? flow.domains.find((item) => item.domainId === requestedDomainId) : undefined;
  const name = readString(item.name, existing?.name ?? "新业务域");
  const domainId = requestedDomainId ?? makeTaxonomyId("domain", name);
  const next: BusinessDomain = {
    domainId,
    name,
    description: readString(item.description, "")
  };
  upsertById(flow.domains, (item) => item.domainId, next);
}

function applyRoleRequest(flow: ProductFlow, request: TaxonomyRequest): void {
  if (request.action === "delete") {
    const roleId = requireRequestId(request);
    flow.roles = flow.roles.filter((item) => item.roleId !== roleId);
    for (const app of flow.appSurfaces ?? []) {
      app.roleIds = app.roleIds.filter((id) => id !== roleId);
    }
    for (const node of flow.nodes) {
      node.roleIds = node.roleIds.filter((id) => id !== roleId);
      node.permissions = node.permissions.filter((id) => id !== roleId);
    }
    for (const edge of flow.edges) {
      edge.roleIds = edge.roleIds.filter((id) => id !== roleId);
    }
    return;
  }
  const item = request.item ?? {};
  const requestedRoleId = request.id ?? readOptionalString(item.roleId);
  const existing = requestedRoleId ? flow.roles.find((item) => item.roleId === requestedRoleId) : undefined;
  const name = readString(item.name, existing?.name ?? "新角色");
  const roleId = requestedRoleId ?? makeTaxonomyId("role", name);
  const next: UserRole = {
    roleId,
    name,
    description: readString(item.description, ""),
    domainIds: knownOnly(readStringArray(item.domainIds), new Set(flow.domains.map((domain) => domain.domainId)))
  };
  upsertById(flow.roles, (item) => item.roleId, next);
}

function applyStatusGroupRequest(flow: ProductFlow, request: TaxonomyRequest): void {
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

function upsertById<T>(items: T[], getId: (item: T) => string, next: T): void {
  const nextId = getId(next);
  const index = items.findIndex((item) => getId(item) === nextId);
  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }
}

function requireRequestId(request: TaxonomyRequest): string {
  if (!request.id) {
    throw new Error("Taxonomy delete requires id.");
  }
  return request.id;
}

function makeTaxonomyId(prefix: string, name: string): string {
  return `${prefix}_${slugify(name, prefix)}_${shortHash(`${name}:${Date.now()}`, 6)}`;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function knownOnly(values: string[], knownIds: Set<string>): string[] {
  return values.filter((value) => knownIds.has(value));
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

function normalizeSurfaceType(value: string): AppSurface["type"] {
  return value === "admin" || value === "web" || value === "app" || value === "miniapp" || value === "desktop" || value === "other"
    ? value
    : "other";
}
