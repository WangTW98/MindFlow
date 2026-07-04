export function buildGeneratePrdPrompt(flowJson: string, selectedNodeJson: string, changeSetJson = "null"): string {
  return `你是资深产品经理。请基于给定 ProductFlow JSON 生成 PRD artifact JSON。

输出必须是严格 JSON，不要输出 Markdown 代码块。JSON 结构必须是：
{
  "metadata": {
    "prdId": "",
    "flowId": "",
    "scope": "node 或 full",
    "nodeId": "单节点 PRD 时填写",
    "linkedPencilIds": [],
    "linkedJsonPath": "",
    "generatedBy": "",
    "createdAt": "",
    "updatedAt": ""
  },
  "markdown": "PRD 正文 Markdown，不包含 YAML frontmatter，插件会负责写入 frontmatter"
}

PRD 必须包含：背景、目标、用户角色、业务域、范围、用户故事、功能需求、页面元素、业务流程、数据需求、权限与约束、状态与异常、验收标准、埋点建议、开放问题。

要求：
- 如果 scope=node，只写选中节点对应页面的 PRD，但必须说明上下游节点关系。
- 如果 scope=full，写完整产品流程 PRD，并按业务域和用户角色组织。
- 不要丢失 nodeId、edgeId、prdId、pencilId 等同步标识。
- 如果是基于 changeSet 刷新 PRD，只更新受影响章节，保留未受影响的用户手工补充内容。

ProductFlow JSON：
${flowJson}

选中节点：
${selectedNodeJson}

关联 ChangeSet：
${changeSetJson}`;
}
