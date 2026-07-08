import type { FeatureGroup, FeatureItem, PageAction, PageElement, PageNode } from "../..";
import { makeActionId, makeElementId, makeFeatureGroupId, makeFeatureItemId } from "../../id";
import { isRecord, normalizeStringArray, sanitizeText } from "./shared";

export function deriveFeatureGroups(node: PageNode): FeatureGroup[] {
  const normalized = normalizeFeatureGroups(node.featureGroups, node.nodeId);
  if (normalized.length > 0) {
    return normalized;
  }
  if (node.elements.length === 0) {
    return [];
  }
  return [
    {
      groupId: makeFeatureGroupId("页面元素", `${node.nodeId}:legacy-elements`),
      name: "页面元素",
      type: "legacyElements",
      description: "由旧版页面元素字段兼容生成。",
      items: node.elements.map((element) => ({
        itemId: makeFeatureItemId(element.name, `${node.nodeId}:${element.elementId}`),
        name: element.name,
        type: element.type,
        description: element.description,
        dataBinding: element.dataBinding,
        required: element.required
      }))
    }
  ];
}

export function normalizeFeatureGroups(value: unknown, nodeId: string): FeatureGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((group, groupIndex) => {
      const name = sanitizeText(group.name, `功能分组 ${groupIndex + 1}`);
      const groupId = typeof group.groupId === "string" && group.groupId.trim()
        ? group.groupId.trim()
        : makeFeatureGroupId(name, `${nodeId}:${groupIndex}:${name}`);
      const items = Array.isArray(group.items) ? group.items.filter(isRecord).map((item, itemIndex) => normalizeFeatureItem(item, nodeId, groupId, itemIndex)) : [];
      const actions = Array.isArray(group.actions) ? group.actions.filter(isRecord).map((action, actionIndex) => normalizeAction(action, nodeId, groupId, actionIndex)) : undefined;
      return {
        groupId,
        name,
        type: sanitizeText(group.type, "section"),
        description: sanitizeText(group.description, ""),
        items,
        actions
      };
    });
}

function normalizeFeatureItem(item: Record<string, unknown>, nodeId: string, groupId: string, itemIndex: number): FeatureItem {
  const name = sanitizeText(item.name, `功能项 ${itemIndex + 1}`);
  return {
    itemId: typeof item.itemId === "string" && item.itemId.trim()
      ? item.itemId.trim()
      : makeFeatureItemId(name, `${nodeId}:${groupId}:${itemIndex}:${name}`),
    name,
    type: sanitizeText(item.type, "text"),
    description: sanitizeText(item.description, ""),
    dataBinding: typeof item.dataBinding === "string" ? item.dataBinding : undefined,
    required: typeof item.required === "boolean" ? item.required : undefined
  };
}

function normalizeAction(action: Record<string, unknown>, nodeId: string, groupId: string, actionIndex: number): PageAction {
  const label = sanitizeText(action.label, `操作 ${actionIndex + 1}`);
  return {
    actionId: typeof action.actionId === "string" && action.actionId.trim()
      ? action.actionId.trim()
      : makeActionId(label, `${nodeId}:${groupId}:${actionIndex}:${label}`),
    label,
    type: sanitizeText(action.type, "user"),
    targetNodeId: typeof action.targetNodeId === "string" ? action.targetNodeId : undefined,
    preconditions: normalizeStringArray(action.preconditions),
    result: typeof action.result === "string" ? action.result : undefined
  };
}

export function featureGroupsToElements(nodeId: string, groups: FeatureGroup[]): PageElement[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      elementId: makeElementId(item.name, `${nodeId}:${group.groupId}:${item.itemId}`),
      name: item.name,
      type: item.type,
      description: item.description,
      dataBinding: item.dataBinding,
      required: item.required
    }))
  );
}

export function featureGroupsToActions(nodeId: string, groups: FeatureGroup[]): PageAction[] {
  const explicit = groups.flatMap((group) => group.actions ?? []);
  const inferred = groups.flatMap((group) =>
    group.items
      .filter((item) => /button|按钮|action|submit|reset|create|delete/i.test(item.type) || /按钮$/.test(item.name))
      .map((item) => ({
        actionId: makeActionId(item.name, `${nodeId}:${group.groupId}:${item.itemId}`),
        label: item.name,
        type: "user",
        result: item.description
      }))
  );
  return [...explicit, ...inferred];
}

export function defaultFeatureGroups(nodeId: string): FeatureGroup[] {
  const groupId = makeFeatureGroupId("基础功能", `${nodeId}:default`);
  return [
    {
      groupId,
      name: "基础功能",
      type: "section",
      description: "页面默认功能分组，可在右侧详情栏编辑。",
      items: [
        {
          itemId: makeFeatureItemId("主要内容", `${nodeId}:${groupId}:content`),
          name: "主要内容",
          type: "content",
          description: "承载此页面的核心业务内容。"
        },
        {
          itemId: makeFeatureItemId("确认按钮", `${nodeId}:${groupId}:confirm`),
          name: "确认按钮",
          type: "button",
          description: "触发页面主要业务操作。"
        }
      ]
    }
  ];
}
