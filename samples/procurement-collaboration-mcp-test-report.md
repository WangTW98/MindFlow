# 采购协同云 MindFlow MCP 全能力测试报告

## 1. 结论

| 项目 | 结果 |
| --- | --- |
| MCP 服务 | `mindflow-vscode 0.1.0` |
| 协议版本 | `2024-11-05` |
| 公开工具 | 33 |
| 通过工具 | 32 |
| 失败工具 | 1（`mindflow_open_flow`） |
| MCP 资源 | 3/3 成功读取 |
| 正式画布校验 | 通过，0 个错误 |
| 正式画布状态 | `untitled:Untitled-6`，revision 178，dirty |

本次不能宣称“33/33 全部通过”。除 `mindflow_open_flow` 外，其余 32 个工具的成功路径均已实际调用；dry-run、原子 changeset、版本冲突、非法橙色出口、分页查询、选择状态、批量操作和软删除也完成了运行时验证。

## 2. 测试范围与环境

- 工作区：`/Users/wang/Public/developments.localized/MindFlow`。
- 来源文档：`samples/procurement-collaboration-prd.md`。
- 实时服务通过 Codex 插件同款 session bootstrap 自动发现，session 的 `workspaceRoots` 与当前工作区一致。
- 测试前读取 `mindflow://operations-reference`、`mindflow://current-model`、`mindflow://authoring-rules`。
- 删除、移除、版本冲突和非法输入只作用于一次性探针画布。
- 正式业务画布使用单独的 `mindflow_create_flow` 创建，未混入探针实体。

## 3. 33 个公开工具结果

| 工具 | 调用数 | 结果 | 实际覆盖 |
| --- | ---: | --- | --- |
| `mindflow_create_flow` | 1 | PASS | 创建一次性未保存画布 |
| `mindflow_open_flow` | 1 | **FAIL** | 工作区内合法文件触发打开后，桥接层因注册时序提前读取而失败 |
| `mindflow_validate_flow` | 2 | PASS | 空画布与探针最终画布结构校验 |
| `mindflow_query_entities` | 16 | PASS | 九种实体、游标翻页、类型过滤、`includeRemoved` |
| `mindflow_apply_canvas_changes` | 4 | PASS | 全 operation kind dry-run/apply、revision 冲突、非法出口回滚 |
| `mindflow_get_editor_state` | 1 | PASS | 完整 flow、schema、capabilities、selection |
| `mindflow_get_open_editors` | 1 | PASS | 多编辑器元数据 |
| `mindflow_get_selection` | 1 | PASS | 水合后的节点、边、应用端和分类选择 |
| `mindflow_set_selection` | 1 | PASS | 多节点、主节点、边、应用端、业务域、角色、状态组 |
| `mindflow_clear_selection` | 1 | PASS | 清空完整选择状态 |
| `mindflow_update_root` | 1 | PASS | 标题、综述、目标 |
| `mindflow_move_root` | 1 | PASS | 根卡片坐标 |
| `mindflow_upsert_app_surface` | 6 | PASS | `admin`、`web`、`app`、`miniapp`、`desktop`、`other` 全枚举 |
| `mindflow_remove_app_surface` | 1 | PASS | 删除一次性应用端并清理引用 |
| `mindflow_move_app_surface` | 1 | PASS | 应用端坐标 |
| `mindflow_upsert_domain` | 2 | PASS | 新增保留域与待删除域 |
| `mindflow_remove_domain` | 1 | PASS | 删除一次性业务域 |
| `mindflow_upsert_role` | 2 | PASS | 新增角色及业务域关联 |
| `mindflow_remove_role` | 1 | PASS | 删除一次性角色 |
| `mindflow_upsert_status_group` | 2 | PASS | 状态组、颜色和描述 |
| `mindflow_remove_status_group` | 1 | PASS | 删除一次性状态组并清理引用 |
| `mindflow_upsert_node` | 1 | PASS | 页面、功能组、功能项、权限、输入输出和坐标 |
| `mindflow_create_connected_node` | 1 | PASS | 节点和 `nestedRelation` 原子创建 |
| `mindflow_update_node` | 1 | PASS | 目的和输出更新 |
| `mindflow_move_node` | 1 | PASS | 单节点坐标更新 |
| `mindflow_remove_node` | 1 | PASS | 单节点软删除及关联边处理 |
| `mindflow_upsert_edge` | 5 | PASS | 五种 edge type 各一条 |
| `mindflow_remove_edge` | 1 | PASS | 单边软删除 |
| `mindflow_batch_get_nodes` | 2 | PASS | 页面/应用端/域/角色/状态过滤及 incident edges |
| `mindflow_batch_upsert_nodes` | 3 | PASS | 五种 pageType、dry-run/apply、状态节点 |
| `mindflow_batch_update_nodes` | 2 | PASS | dry-run 与原子更新 |
| `mindflow_batch_move_nodes` | 2 | PASS | dry-run 与原子移动 |
| `mindflow_batch_remove_nodes` | 2 | PASS | dry-run 与原子软删除 |

## 4. Changeset 与失败路径证据

### 4.1 全 operation kind

一次 changeset 覆盖：

- `root.update`、`root.move`
- `taxonomy.upsert`、`taxonomy.remove`
- `appSurface.move`
- `node.upsert`、`node.move`、`node.remove`
- `edge.upsert`、`edge.remove`

dry-run 前后编辑器 revision 均为 45；返回的模拟结果 revision 为 62，但未写入编辑器。随后使用相同 expected revision 和操作集合应用成功，编辑器 revision 从 45 变为 62。

### 4.2 并发和非法出口

- 使用旧 revision 45 再次提交时，返回 `ProductFlow revision conflict. Expected 45, found 62.`，编辑器保持 revision 62。
- 使用通用 node card 发起 `interaction` dry-run 时，返回 `interaction must originate from a featureItem or featureGroup outlet`，operationCount 为 0，revision 保持 62。
- 批量新增、更新、移动、删除的 dry-run 均不改变编辑器 revision。

## 5. `mindflow_open_flow` 缺陷

### 5.1 复现步骤

1. 在当前工作区写入一个通过 ProductFlow 解析的 `.mindflow` 临时文件。
2. 调用 `mindflow_open_flow`，参数为工作区相对路径。
3. 自定义编辑器窗口被异步触发，但 MCP 调用返回失败：

```text
MindFlow MCP can only access an open MindFlow editor: file:///.../mcp-open-flow-fixture-....mindflow
```

### 5.2 原因定位

`VsCodeMindFlowEditorBridge.openFlow` 调用同步返回的 `FlowPanel.createOrShow` 后立即执行 `readSnapshot`。`FlowPanel.createOrShow` 对 `vscode.openWith` 使用 fire-and-forget，`resolveCustomTextEditor` 尚未来得及向 registry 注册 session，因此第一次打开合法文件存在稳定的竞态窗口。文件稍后确实会出现在 VS Code 中；再次调用已打开文件时可以成功。

本任务按约定仅记录缺陷，没有修改实现。

## 6. 正式采购协同画布

### 6.1 两批生成结果

| 批次 | 内容 | revision |
| --- | --- | --- |
| Batch 1 | 根、7 个业务域、9 个角色、3 个状态组、4 个应用端、32 个核心节点、47 条关系 | 1 → 141 |
| Batch 2 | 13 个状态节点、10 条状态迁移、1 条计划回看关系 | 141 → 178 |

两批均先用当前 revision dry-run，确认 `validation.valid=true` 且编辑器 revision 不变，再原样应用。

### 6.2 最终统计

| 实体 | 数量 |
| --- | ---: |
| Root | 1 |
| 应用端 | 4 |
| 业务域 | 7 |
| 角色 | 9 |
| 状态组 | 3 |
| 节点 | 45 |
| 功能组 | 45 |
| 功能项 | 79 |
| 连线 | 58 |

连线类型为：`nestedRelation` 28、`interaction` 9、`autoNavigate` 6、`dataFlow` 5、`statusChange` 10。九类实体均通过 limit=25 的游标分页重新统计，结果与 `mindflow_validate_flow` 完全一致。

### 6.3 最终校验

- `valid=true`，结构错误 0。
- 10 条 warning 均为已解释的 `statusChange` node-card 出口确认；这些边连接同一非空状态组内的独立状态节点，属于明确的整节点状态生命周期。
- 正式画布当前为 `untitled:Untitled-6`，revision 178，dirty。
- MCP 未保存文件；建议人工审阅后保存为 `.mindflow/flows/procurement-collaboration-demo.mindflow`。

## 7. 验收结论

- PRD、分区分析、综合、图设计、两批生成、实体分页核对和最终校验均完成。
- 33 个公开工具均已实际调用，32 个通过，1 个失败并给出稳定复现与代码级原因。
- 一次性删除探针未进入正式画布。
- 由于 `mindflow_open_flow` 失败，本轮整体结论为“部分通过”，不能标记为完整通过。

## 8. 仓库级验证

- `npm test`：96 项通过，0 项失败。
- `validate_mindflow_draft.py`：1 个图草稿通过。
- `mindflow_task.py validate`：任务状态通过。
- `git diff --check`：通过。

## 10. 通用文档分析与导航层级全量重建（2026-07-15）

### 10.1 通用能力修正

- 文档分析契约要求先识别实际产品背景、问题、范围、角色、流程、权限、数据和验收信息，再生成项目综述、项目目标和应用端介绍；不预设采购业务、应用端数量或固定解决方案模板。
- 草稿校验器对存在的 root/appSurface 记录检查实质性长文和占位文案，但不使用业务关键词或固定端数量；单端、多端及无独立应用端均由来源决定。
- 项目综述、项目目标和应用端介绍继续使用原 Schema 字段。根卡片与应用端卡片展示截断摘要，详情面板使用可调整的长文本区展示完整多段内容。
- 骨架保留顶栏、页头、页脚、正文/内容区域和布局组件。骨架只直接连接顶级导航；子导航必须由父导航功能项通过 `interaction` 连接。

### 10.2 Bootstrap、资源与 33 工具

扩展编译后重载实时 VS Code extension host，使用 Codex 插件同款 bootstrap 验证：

- MCP server：`mindflow-vscode` 0.1.0。
- 公开工具：33 个。
- 资源：`mindflow://operations-reference`、`mindflow://current-model`、`mindflow://authoring-rules` 均可发现和读取。
- 一次性探针：32/33 工具成功。
- `mindflow_open_flow` 本轮失败，原因是磁盘上的旧 revision 419 文件包含一个受限出口双目标和一个导航双父级，新结构校验在打开前正确拒绝该旧文件；未将此调用标记为通过，也未直接修改旧 JSON。

### 10.3 来源驱动重建

新任务目录只以 PRD 1.2（SHA-256 `f54d847bd3e1823117dc56ea8b8528c925bf7b667248c624fb43e0672cc7e0b9`）为业务来源，当前画布不作为节点或文案证据。图草稿先生成再通过 `validate_mindflow_draft.py`。

扩展重载后，旧的未保存正式编辑会话没有恢复，且旧磁盘文件无法通过新规则打开。因此通过 MCP 创建无探针历史的新 Untitled 正式画布，再按同一 dry-run/apply changeset 分两批生成：

| 阶段 | 节点 | 边 | revision | 结果 |
| --- | ---: | ---: | --- | --- |
| 清空/初始化 | 0 | 0 | 1 → 2 | dry-run 与 apply 通过 |
| Batch 1 | 40 | 54 | 2 → 160 | dry-run 与 apply 通过 |
| Batch 2 | 18 | 20 | 160 → 216 | dry-run 与 apply 通过 |

### 10.4 最终语义与统计

| 类别 | 结果 |
| --- | --- |
| Root 文案 | 综述 296 字；目标 206 字；均来自 PRD 分区综合 |
| 应用端介绍 | 4 个，长度分别为 183、160、159、168 字 |
| 节点 | 58：4 skeleton、5 navigation、36 page、5 popup、8 component |
| 连线 | 74：16 nestedRelation、34 interaction、9 autoNavigate、5 dataFlow、10 statusChange |
| 功能 | 58 个功能组、178 个功能项、默认模板 0 |
| 结构 | 孤立节点 0、通用节点卡片来源 0、受限出口多目标 0 |

四个骨架的布局功能保持如下：

- 后台：顶栏、左侧主导航、内容区域、消息抽屉入口。
- 供应商门户：品牌顶栏、任务导航、正文区域、通知中心。
- 移动审批：移动顶栏、内容区域、底部导航。
- 公开网站：站点页头、公开导航、正文区域、站点页脚。

五个导航均只有一个合法父级。特别地，“询价与报价子导航”唯一入边来自“后台主导航”的功能项，类型为 `interaction`；后台骨架只连接后台主导航和管理后台顶栏。

`mindflow_validate_flow` 在 revision 216 返回 `valid=true`、errors 0、warnings 0。九类实体已分页核对。VS Code 当前聚焦 `Untitled-4 — MindFlow`，编辑器 `active=true`、`dirty=true`；用户审阅后应保存覆盖 `.mindflow/flows/procurement-collaboration-demo.mindflow`。

### 10.5 本轮验证

- `npm test`：104/104 通过。
- `npm run typecheck`：通过。
- `npm run compile`：通过并重载扩展。
- `npm run smoke:webview`：通过。
- `validate_mindflow_draft.py`：58 节点 / 74 边草稿通过。
- `mindflow_task.py validate`：通过。
- `git diff --check`：通过。
- 正式 `Untitled-6` 画布已切换为 VS Code 当前活动标签，等待人工审阅和保存。

## 9. 后续语义复核与结构修正（2026-07-15）

### 9.1 复核结论

用户将上轮画布保存为 `.mindflow/flows/procurement-collaboration-demo.mindflow` 后，对保存版 revision 228 进行语义复核，发现：

- 45 个活动节点、58 条活动边。
- 39 条边从通用节点卡片发起：28 条 `nestedRelation`、10 条 `statusChange`、1 条 `autoNavigate`。
- 4 个应用端都没有持久化的应用端到骨架入口边。
- 26 个节点仍使用“基础功能 / 主要内容 / 确认按钮”默认模板。
- 骨架直连业务页面，顶栏、页头、页脚、主导航、底部导航和子导航未形成可识别的布局层级。

### 9.2 创作契约回归

本轮已收紧 MCP 创作校验：

- 五种边类型都禁止以通用节点卡片为来源，`cardOutletReason` 不再豁免。
- 应用端卡片只能用 `nestedRelation` 进入归属于该应用端的 `skeleton`。
- 新建通用节点必须显式提供非空的语义功能组与功能项，默认模板在正式 MCP 校验中视为未完成内容。
- 骨架可以从不同布局功能项同时连接多个 `navigation` 和布局 `component`。
- 保存前入口修复只在应用端存在唯一活动骨架时补边，不再猜测工作台或首页。

PRD、MCP 服务说明、authoring rules、草稿校验器以及 Codex/Claude 集成副本已同步该契约。编辑器仍保留通用卡片出口，用于人工编辑和旧数据兼容。

### 9.3 实时 MCP 迁移证据

迁移仅通过已打开画布的实时 MCP 执行，没有直接改写 `.mindflow` JSON。

| 阶段 | 内容 | revision | 结果 |
| --- | --- | --- | --- |
| Batch 1 dry-run | 29 个节点更新、24 条边更新、19 条边软删除 | 228 → 模拟 300 | 通过，编辑器保持 228 |
| Batch 1 apply | 替换默认功能并移除旧结构边 | 228 → 300 | 通过 |
| Batch 2 首次 dry-run | 新节点和新关系 | 300 | 重复 `localRef` 安全失败，无副作用 |
| Batch 2 修正后 dry-run | 13 个节点新建、30 条边新建 | 300 → 模拟 356 | 通过，编辑器保持 300 |
| Batch 2 apply | 补齐导航、顶栏、页头页脚、缺失页面和报价组件/弹窗 | 300 → 356 | 通过 |

### 9.4 最终实体与语义校验

| 类别 | 最终结果 |
| --- | --- |
| 节点 | 58：`skeleton` 4、`navigation` 5、`page` 36、`popup` 5、`component` 8 |
| 连线 | 73：`nestedRelation` 17、`interaction` 35、`autoNavigate` 6、`dataFlow` 5、`statusChange` 10 |
| 出口 | 应用端卡片 4、功能项 69、通用节点卡片 0 |
| 功能 | 功能组 61、功能项 154、默认模板节点 0 |
| 分类 | 应用端 4、业务域 7、角色 9、状态组 3 |

`mindflow_validate_flow` 对 revision 356 返回 `valid=true`、errors 0、warnings 0。九类实体已通过分页查询重新统计，与校验摘要一致。

### 9.5 回归边界

- 本轮保留第 3 节中原 33 个工具记录及“32 通过、1 失败”结论，不将历史失败改写为通过。
- 本轮不修复、不重新判定 `mindflow_open_flow` 竞态缺陷。
- 画布保持在 VS Code 已验证的 dirty revision 356；用户审阅后再保存回 `.mindflow/flows/procurement-collaboration-demo.mindflow`。

### 9.6 修正后仓库验证

- `npm test`：99/99 通过。
- `npm run typecheck`：通过。
- `npm run smoke:webview`：通过并生成 smoke 页面。
- `validate_mindflow_draft.py`：结构修正图草稿通过。
- `mindflow_task.py validate`：新任务目录通过。
- `git diff --check`：通过。
