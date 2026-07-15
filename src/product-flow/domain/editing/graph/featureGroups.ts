import type { FeatureGroup, FeatureItem, PageAction, PageNode } from "../..";
import { makeActionId, makeFeatureGroupId, makeFeatureItemId } from "../../id";
import { isRecord, normalizeStringArray, sanitizeText } from "./shared";

export function deriveFeatureGroups(node: PageNode): FeatureGroup[] {
  return normalizeFeatureGroups(node.featureGroups, node.nodeId);
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
