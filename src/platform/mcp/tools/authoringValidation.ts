import type { EdgeType, FeatureGroup, FlowEndpoint, ProductFlow, ValidationResult } from "../../../product-flow/domain";

export function assertMcpEdgeSource(
  from: FlowEndpoint | undefined,
  _type: EdgeType,
  _cardOutletReason?: string
): void {
  if (!from || from.kind !== "node") {
    return;
  }
  throw new Error("MindFlow MCP edges must originate from a featureItem or featureGroup outlet, not a generic node card. Root and app-surface card outlets remain valid.");
}

export function assertMcpNodeFeatureGroups(featureGroups: FeatureGroup[] | undefined): void {
  if (!featureGroups?.some((group) => Array.isArray(group.items) && group.items.length > 0)) {
    throw new Error("New MindFlow MCP nodes require at least one explicit feature group with one feature item.");
  }
  if (isDefaultPlaceholder(featureGroups)) {
    throw new Error("New MindFlow MCP nodes must replace the default 基础功能 / 主要内容 / 确认按钮 placeholder with semantic features.");
  }
}

export function validateMcpAuthoring(flow: ProductFlow, structural: ValidationResult): ValidationResult {
  const errors = [...structural.errors];
  const warnings = [...structural.warnings];
  const activeNodes = new Map(flow.nodes.filter((node) => node.status !== "removed").map((node) => [node.nodeId, node]));
  for (const node of flow.nodes) {
    if (node.status === "removed") continue;
    if (isDefaultPlaceholder(node.featureGroups)) {
      errors.push(`Node ${node.nodeId} still uses the default feature placeholder; replace it with semantic layout, navigation, content, action, or state features.`);
    }
    const incoming = flow.edges.filter((edge) => edge.status !== "removed" && edge.to.nodeId === node.nodeId);
    if (incoming.length === 0) {
      errors.push(`Node ${node.nodeId} has no active incoming edge; MCP-authored nodes must have a parent or business-event entry.`);
    }
    if (node.pageType === "navigation" && incoming.length !== 1) {
      errors.push(`Navigation node ${node.nodeId} must have exactly one active hierarchy parent in MCP-authored flows; found ${incoming.length}.`);
    } else if (node.pageType === "navigation") {
      const parent = incoming[0]!;
      const sourceNode = parent.from.kind === "featureGroup" || parent.from.kind === "featureItem"
        ? activeNodes.get(parent.from.nodeId)
        : undefined;
      const topLevelNavigation = sourceNode?.pageType === "skeleton" && parent.type === "nestedRelation";
      const childNavigation = sourceNode?.pageType === "navigation" && parent.type === "interaction";
      if (!topLevelNavigation && !childNavigation) {
        errors.push(`Navigation node ${node.nodeId} must be a top-level skeleton nestedRelation or a child navigation interaction from its parent navigation item.`);
      }
    }
  }
  for (const edge of flow.edges) {
    if (edge.status === "removed") {
      continue;
    }
    if (edge.from.kind === "node") {
      errors.push(`Edge ${edge.edgeId} ${edge.type} originates from a generic node card; use a featureItem or featureGroup outlet.`);
    }
    if (edge.from.kind === "appSurface") {
      const target = flow.nodes.find((node) => node.nodeId === edge.to.nodeId && node.status !== "removed");
      if (edge.type !== "nestedRelation" || edge.to.kind !== "node" || target?.pageType !== "skeleton" || !target.appSurfaceIds.includes(edge.from.appId)) {
        errors.push(`Edge ${edge.edgeId} app-surface entry must be a nestedRelation to a skeleton owned by app ${edge.from.appId}.`);
      }
    }
  }
  for (const surface of flow.appSurfaces ?? []) {
    const entries = flow.edges.filter((edge) => edge.status !== "removed" && edge.from.kind === "appSurface" && edge.from.appId === surface.appId);
    if (entries.length > 1) {
      errors.push(`App surface ${surface.appId} has ${entries.length} active entry edges; exactly one app-to-skeleton entry is allowed.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

function isDefaultPlaceholder(featureGroups: FeatureGroup[]): boolean {
  return featureGroups.length === 1 &&
    featureGroups[0]?.name === "基础功能" &&
    featureGroups[0].items.length === 2 &&
    featureGroups[0].items.some((item) => item.name === "主要内容") &&
    featureGroups[0].items.some((item) => item.name === "确认按钮");
}
