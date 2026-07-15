import { isRecord, rejectUnknownKeys, requireNonEmptyString, requireNumber, requireOptionalBoolean, requireOptionalString, requireString, requireStringArray } from "./primitives";

export function validateFeatureGroups(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const groupIds = new Set<string>();
  for (const [index, group] of value.entries()) {
    const groupPath = `${path}[${index}]`;
    if (!isRecord(group)) {
      errors.push(`${groupPath} must be an object.`);
      continue;
    }
    rejectUnknownKeys(group, ["groupId", "name", "type", "description", "items", "actions"], groupPath, errors);
    requireNonEmptyString(group, "groupId", errors, groupPath);
    requireNonEmptyString(group, "name", errors, groupPath);
    requireNonEmptyString(group, "type", errors, groupPath);
    requireString(group, "description", errors, groupPath);
    if (typeof group.groupId === "string") {
      if (groupIds.has(group.groupId)) {
        errors.push(`Duplicate feature group id at ${groupPath}: ${group.groupId}`);
      }
      groupIds.add(group.groupId);
    }
    validateFeatureItems(group.items, `${groupPath}.items`, errors);
    if (group.actions !== undefined) {
      validateActions(group.actions, `${groupPath}.actions`, errors);
    }
  }
}

export function validateElements(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const ids = new Set<string>();
  for (const [index, element] of value.entries()) {
    const elementPath = `${path}[${index}]`;
    if (!isRecord(element)) {
      errors.push(`${elementPath} must be an object.`);
      continue;
    }
    rejectUnknownKeys(element, ["elementId", "name", "type", "description", "dataBinding", "required"], elementPath, errors);
    requireNonEmptyString(element, "elementId", errors, elementPath);
    requireNonEmptyString(element, "name", errors, elementPath);
    requireNonEmptyString(element, "type", errors, elementPath);
    requireString(element, "description", errors, elementPath);
    requireOptionalString(element, "dataBinding", errors, elementPath);
    requireOptionalBoolean(element, "required", errors, elementPath);
    if (typeof element.elementId === "string") {
      if (ids.has(element.elementId)) {
        errors.push(`Duplicate elementId at ${elementPath}: ${element.elementId}`);
      }
      ids.add(element.elementId);
    }
  }
}

export function validateActions(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const ids = new Set<string>();
  for (const [index, action] of value.entries()) {
    const actionPath = `${path}[${index}]`;
    if (!isRecord(action)) {
      errors.push(`${actionPath} must be an object.`);
      continue;
    }
    rejectUnknownKeys(action, ["actionId", "label", "type", "targetNodeId", "preconditions", "result"], actionPath, errors);
    requireNonEmptyString(action, "actionId", errors, actionPath);
    requireNonEmptyString(action, "label", errors, actionPath);
    requireNonEmptyString(action, "type", errors, actionPath);
    requireOptionalString(action, "targetNodeId", errors, actionPath);
    if ("preconditions" in action) {
      requireStringArray(action, "preconditions", errors, actionPath);
    }
    requireOptionalString(action, "result", errors, actionPath);
    if (typeof action.actionId === "string") {
      if (ids.has(action.actionId)) {
        errors.push(`Duplicate actionId at ${actionPath}: ${action.actionId}`);
      }
      ids.add(action.actionId);
    }
  }
}

export function readFeatureGroups(node: Record<string, unknown>): Array<{ groupId: string; items: Array<{ itemId: string }> }> {
  if (!Array.isArray(node.featureGroups)) {
    return [];
  }
  return node.featureGroups.filter(isRecord).map((group) => ({
    groupId: typeof group.groupId === "string" ? group.groupId : "",
    items: Array.isArray(group.items)
      ? group.items.filter(isRecord).map((item) => ({ itemId: typeof item.itemId === "string" ? item.itemId : "" }))
      : []
  }));
}

export function validateOptionalViewPosition(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  rejectUnknownKeys(value, ["position"], path, errors);
  if (value.position === undefined) {
    return;
  }
  if (!isRecord(value.position)) {
    errors.push(`${path}.position must be an object.`);
    return;
  }
  rejectUnknownKeys(value.position, ["x", "y"], `${path}.position`, errors);
  requireNumber(value.position, "x", errors, `${path}.position`);
  requireNumber(value.position, "y", errors, `${path}.position`);
}

function validateFeatureItems(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const itemIds = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object.`);
      continue;
    }
    rejectUnknownKeys(item, ["itemId", "name", "type", "description", "dataBinding", "required"], itemPath, errors);
    requireNonEmptyString(item, "itemId", errors, itemPath);
    requireNonEmptyString(item, "name", errors, itemPath);
    requireNonEmptyString(item, "type", errors, itemPath);
    requireString(item, "description", errors, itemPath);
    requireOptionalString(item, "dataBinding", errors, itemPath);
    requireOptionalBoolean(item, "required", errors, itemPath);
    if (typeof item.itemId === "string") {
      if (itemIds.has(item.itemId)) {
        errors.push(`Duplicate feature item id at ${itemPath}: ${item.itemId}`);
      }
      itemIds.add(item.itemId);
    }
  }
}

function validateObjectArrayWithStrings(
  value: unknown,
  path: string,
  keys: string[],
  idKey: string,
  errors: string[]
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${itemPath} must be an object.`);
      continue;
    }
    rejectUnknownKeys(item, keys, itemPath, errors);
    for (const key of keys) {
      if (key === idKey || key === "name") {
        requireNonEmptyString(item, key, errors, itemPath);
      } else {
        requireString(item, key, errors, itemPath);
      }
    }
    const id = item[idKey];
    if (typeof id === "string") {
      if (ids.has(id)) {
        errors.push(`Duplicate ${idKey} at ${itemPath}: ${id}`);
      }
      ids.add(id);
    }
  }
}
