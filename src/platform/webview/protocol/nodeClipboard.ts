import { NODE_PAGE_TYPES, type FeatureGroup } from "../../../product-flow/domain";
import type { PasteNodeSnapshot } from "../../../product-flow/application/operations";

export const MINDFLOW_NODE_CLIPBOARD_KIND = "mindflow.nodes";
export const MINDFLOW_NODE_CLIPBOARD_VERSION = 1;

export interface MindFlowNodeClipboardPayload {
  kind: typeof MINDFLOW_NODE_CLIPBOARD_KIND;
  version: typeof MINDFLOW_NODE_CLIPBOARD_VERSION;
  primaryIndex: number;
  nodes: PasteNodeSnapshot[];
}

export function serializeMindFlowNodeClipboard(payload: MindFlowNodeClipboardPayload): string {
  const normalized = readMindFlowNodeClipboardPayload(payload);
  if (!normalized) {
    throw new Error("MindFlow node clipboard payload is invalid.");
  }
  return JSON.stringify(normalized);
}

export function parseMindFlowNodeClipboard(text: string): MindFlowNodeClipboardPayload | undefined {
  if (typeof text !== "string" || !text.trim()) {
    return undefined;
  }
  try {
    return readMindFlowNodeClipboardPayload(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export function readMindFlowNodeClipboardPayload(value: unknown): MindFlowNodeClipboardPayload | undefined {
  if (!isRecordWithKeys(value, ["kind", "version", "primaryIndex", "nodes"])) {
    return undefined;
  }
  if (value.kind !== MINDFLOW_NODE_CLIPBOARD_KIND || value.version !== MINDFLOW_NODE_CLIPBOARD_VERSION) {
    return undefined;
  }
  if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
    return undefined;
  }
  const nodes = Array.from(value.nodes, readClipboardNode);
  if (nodes.some((node) => node === undefined)) {
    return undefined;
  }
  const primaryIndex = typeof value.primaryIndex === "number" ? value.primaryIndex : Number.NaN;
  if (!Number.isInteger(primaryIndex) || primaryIndex < 0 || primaryIndex >= nodes.length) {
    return undefined;
  }
  return {
    kind: MINDFLOW_NODE_CLIPBOARD_KIND,
    version: MINDFLOW_NODE_CLIPBOARD_VERSION,
    primaryIndex,
    nodes: nodes as PasteNodeSnapshot[]
  };
}

function readClipboardNode(value: unknown): PasteNodeSnapshot | undefined {
  if (!isRecordWithKeys(value, [
    "title", "pageType", "purpose", "appSurfaceIds", "statusGroupId", "domainIds",
    "roleIds", "permissions", "featureGroups", "offsetX", "offsetY"
  ])) {
    return undefined;
  }
  const pageType = value.pageType;
  const appSurfaceIds = readStringArray(value.appSurfaceIds);
  const domainIds = readStringArray(value.domainIds);
  const roleIds = readStringArray(value.roleIds);
  const permissions = readStringArray(value.permissions);
  const featureGroups = readFeatureGroups(value.featureGroups);
  if (
    typeof value.title !== "string" ||
    typeof value.purpose !== "string" ||
    !(NODE_PAGE_TYPES as readonly unknown[]).includes(pageType) ||
    !appSurfaceIds || !domainIds || !roleIds || !permissions || !featureGroups ||
    !Number.isFinite(value.offsetX) || !Number.isFinite(value.offsetY) ||
    (value.statusGroupId !== undefined && typeof value.statusGroupId !== "string")
  ) {
    return undefined;
  }
  return {
    title: value.title,
    pageType: pageType as PasteNodeSnapshot["pageType"],
    purpose: value.purpose,
    appSurfaceIds,
    ...(typeof value.statusGroupId === "string" ? { statusGroupId: value.statusGroupId } : {}),
    domainIds,
    roleIds,
    permissions,
    featureGroups,
    offsetX: value.offsetX as number,
    offsetY: value.offsetY as number
  };
}

function readFeatureGroups(value: unknown): FeatureGroup[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const groups = Array.from(value, (group) => {
    if (!isRecordWithKeys(group, ["groupId", "name", "type", "description", "items", "actions"])) {
      return undefined;
    }
    const items = readFeatureItems(group.items);
    const actions = group.actions === undefined ? undefined : readFeatureActions(group.actions);
    if (
      typeof group.groupId !== "string" || typeof group.name !== "string" ||
      typeof group.type !== "string" || typeof group.description !== "string" ||
      !items || (group.actions !== undefined && !actions)
    ) {
      return undefined;
    }
    return {
      groupId: group.groupId,
      name: group.name,
      type: group.type,
      description: group.description,
      items,
      ...(actions ? { actions } : {})
    };
  });
  return groups.some((group) => group === undefined) ? undefined : groups as FeatureGroup[];
}

function readFeatureItems(value: unknown): FeatureGroup["items"] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = Array.from(value, (item) => {
    if (!isRecordWithKeys(item, ["itemId", "name", "type", "description", "dataBinding", "required"])) {
      return undefined;
    }
    if (
      typeof item.itemId !== "string" || typeof item.name !== "string" ||
      typeof item.type !== "string" || typeof item.description !== "string" ||
      (item.dataBinding !== undefined && typeof item.dataBinding !== "string") ||
      (item.required !== undefined && typeof item.required !== "boolean")
    ) {
      return undefined;
    }
    return {
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      description: item.description,
      ...(typeof item.dataBinding === "string" ? { dataBinding: item.dataBinding } : {}),
      ...(typeof item.required === "boolean" ? { required: item.required } : {})
    };
  });
  return items.some((item) => item === undefined) ? undefined : items as FeatureGroup["items"];
}

function readFeatureActions(value: unknown): NonNullable<FeatureGroup["actions"]> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const actions = Array.from(value, (action) => {
    if (!isRecordWithKeys(action, ["actionId", "label", "type", "preconditions", "result"])) {
      return undefined;
    }
    const preconditions = action.preconditions === undefined ? undefined : readStringArray(action.preconditions);
    if (
      typeof action.actionId !== "string" || typeof action.label !== "string" ||
      typeof action.type !== "string" ||
      (action.preconditions !== undefined && !preconditions) ||
      (action.result !== undefined && typeof action.result !== "string")
    ) {
      return undefined;
    }
    return {
      actionId: action.actionId,
      label: action.label,
      type: action.type,
      ...(preconditions ? { preconditions } : {}),
      ...(typeof action.result === "string" ? { result: action.result } : {})
    };
  });
  return actions.some((action) => action === undefined) ? undefined : actions as NonNullable<FeatureGroup["actions"]>;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = Array.from(value);
  return values.every((item) => typeof item === "string")
    ? Array.from(new Set(values as string[]))
    : undefined;
}

function isRecordWithKeys(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowedKeys.includes(key))
  );
}
