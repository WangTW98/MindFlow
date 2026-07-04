export function buildGeneratePencilPrompt(flowJson: string, selectedNodeJson: string, linkedPrdMetadata: string, changeSetJson = "null"): string {
  return `你是产品设计 Agent。请基于 ProductFlow JSON 生成 Pencil 设计稿结构说明。

输出必须是严格 JSON，不要输出 Markdown，不要包裹代码块。

目标：
- 如果 scope=node，生成选中节点对应页面的 Pencil 设计稿 spec。
- 如果 scope=full，生成完整流程中全部页面的 Pencil 设计稿 spec。
- 每个页面必须包含布局、组件、状态、交互、数据绑定、导航关系、响应式要求。
- 所有页面和组件必须保留 ProductFlow 中的 nodeId、elementId、actionId。
- 输出元数据必须包含 pencilId、flowId、scope、nodeId、linkedPrdIds、linkedJsonPath。

ProductFlow JSON：
${flowJson}

选中节点：
${selectedNodeJson}

关联 PRD：
${linkedPrdMetadata}

关联 ChangeSet：
${changeSetJson}`;
}
