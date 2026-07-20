# MindFlow

> 面向产品经理的结构化产品思维画布。在 VS Code 中使用节点、连线、应用形态、业务域、角色与状态描述产品，并通过 MCP 与 Agent Skills 接入可审阅的 AI 辅助分析与渐进式编辑。

[![CI](https://github.com/WangTW98/MindFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/WangTW98/MindFlow/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/WangTW98/MindFlow?include_prereleases&label=release)](https://github.com/WangTW98/MindFlow/releases)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE.txt)

MindFlow 是一个本地运行的 VS Code 自定义编辑器，用于创建、读取、编辑、排版、校验和保存 `.mindflow` 产品思维导图。它把产品综述、应用形态、页面与组件、业务状态以及关键交互统一到一张可追踪的结构化画布中，适合产品梳理、方案评审、流程核验和 AI 协作。

MindFlow 本身不包含大模型、AI SDK、文档解析器或代码扫描器。需求理解和产品分析由外部 Agent 完成；MindFlow 负责提供严格的数据模型、人工编辑界面、MCP 读写能力以及与当前版本匹配的 Agent Skills。

## 为什么使用 MindFlow

- **面向产品经理建模**：节点不仅有标题和层级，还可以绑定应用形态、业务域、角色、权限、状态组和详细功能。
- **一张画布表达完整产品**：从唯一的产品综述根节点出发，逐步展开应用入口、导航、页面、弹窗、组件和业务状态。
- **人工编辑与 AI 操作一致**：画布操作与 MCP 复用同一应用操作层和校验规则，便于用户检查、调整和撤销 AI 的修改。
- **渐进式、可审阅的 AI 写入**：外部 Agent 可以先读取和分析，再按小批次 dry-run、写入、聚焦和复核，而不是一次性覆盖整张画布。
- **本地文件优先**：`.mindflow` 是可校验的 JSON 文档；MCP 修改 VS Code 中的文档，但不会代替用户保存文件。

## 核心能力

### 结构化画布编辑

- 在画布和右侧详情面板中编辑产品综述、应用形态、普通节点、分类数据与连线。
- 支持节点筛选、搜索、拖动、框架化自动排版，以及节点列表和 From/To 关系的平滑聚焦。
- 支持普通节点多选、整体拖动、批量删除，以及跨 MindFlow 文档的复制粘贴。
- 支持查看连线的来源与去向；定位目标时使用临时呼吸轮廓，不改变用户的手动选择状态。
- 对画布模型进行严格校验，拒绝失效引用、重复标识和已废弃字段。

### 产品分类与详情

- 应用形态：Web、App、小程序、桌面端、管理后台及其他产品入口。
- 业务分类：业务域、角色、权限和状态组。
- 普通节点：骨架、导航、页面、弹窗和组件。
- 节点详情：用途、所属分类、功能分组、功能项及操作语义。

### MCP 读取与编辑

扩展启动后会创建经过身份验证的本地回环 MCP 会话，并安装稳定的全局 stdio Router。MCP 可以：

- 创建、打开和校验 MindFlow；
- 读取编辑器状态、完整画布、当前选择、分页实体和局部子图；
- 跟踪有向路径，读取节点、功能、分类和连线关系；
- 新建、更新、移动、复制或删除普通节点；
- 编辑产品综述、应用形态、业务域、角色、状态组和连线；
- 预览或应用基于真实卡片尺寸的自动排版；
- 使用版本检查和请求内引用 dry-run 或原子应用有界变更集；
- 聚焦并临时高亮变更实体，而不修改选择状态。

MCP 的修改通过一次原子 VS Code 编辑写入当前文档。画布会进入未保存状态，用户可以检查、撤销或保存变更。

## 画布模型

每个 MindFlow 默认且只能有一个产品综述根节点，后续内容从该节点展开。

| 实体 | 用途 |
| --- | --- |
| 产品综述 | 描述产品名称、综合说明和产品目标，是整张画布的唯一根节点 |
| 应用形态 | 表达 Web、App、管理后台等独立产品入口，并绑定业务域和角色 |
| 普通节点 | 表达骨架、导航、页面、弹窗、组件及独立业务状态 |
| 业务域 | 划分产品覆盖的业务范围 |
| 角色 | 描述参与者及其可访问的业务域 |
| 状态组 | 组织加载、空数据、错误、成功、拒绝及其他业务状态节点 |
| 连线 | 表达交互、自动跳转、数据流、状态变化和结构包含关系 |

MindFlow 只支持以下五种连线类型：

| 类型 | 含义 |
| --- | --- |
| `interaction` | 用户触发的行为或可见导航 |
| `autoNavigate` | 系统触发的页面或视图跳转 |
| `dataFlow` | 数据读取、写入、传递或同步 |
| `statusChange` | 同一状态组内的业务状态变化 |
| `nestedRelation` | 产品结构上的包含关系 |

提交、审批、拒绝和 CRUD 等业务含义应写入连线的 `trigger`、`action` 和 `condition`。普通业务连线优先从对应功能项的橙色出口发起；卡片级出口保留给结构包含、系统行为或整节点生命周期。

## 快速开始

### 环境要求

- VS Code `1.92.0` 或更高版本。
- 本地桌面版 VS Code。当前不支持 Remote SSH、WSL、Dev Container 和虚拟文件系统路径。
- 如需运行导出的 Agent Skills 确定性脚本，需要 Python 3。

### 安装 VSIX

1. 在 [GitHub Releases](https://github.com/WangTW98/MindFlow/releases) 下载最新 Pre-release 中的 `.vsix` 文件。
2. 在 VS Code 中执行“扩展：从 VSIX 安装...”，选择下载的文件。
3. 也可以使用命令行安装：

```bash
code --install-extension mindflow-canvas-editor-<version>-<sha12>.vsix --force
```

### 创建第一张画布

1. 打开命令面板，执行 `MindFlow: 新建空白画布`。
2. 编辑产品综述，并通过画布空白区域右键或详情面板创建普通节点。
3. 使用连接点建立结构、交互、数据或状态关系。
4. 检查右侧详情与连线 From/To 关系，完成后保存为 `.mindflow` 文件。

## 常用编辑操作

| 操作 | 结果 |
| --- | --- |
| 单击节点 | 选择节点并在右侧显示详情 |
| `Cmd/Ctrl/Shift` + 单击 | 增加或移除普通节点多选 |
| `Cmd/Ctrl+A` | 选择全部未删除的普通节点，不选择根节点、应用形态或连线 |
| 拖动任意已选节点 | 整体移动当前多选节点并保持相对位置 |
| `Cmd/Ctrl+C`、`Cmd/Ctrl+V` | 复制普通节点，并在当前画布鼠标位置粘贴 |
| `Delete` 或 `Backspace` | 删除全部已选普通节点或当前支持删除的选中实体 |
| 双击标题，或聚焦标题后按 `Enter`/`F2` | 进入标题行内编辑 |
| 滚轮/触控板滚动 | 平移画布 |
| `Cmd/Ctrl` + 滚轮 | 以鼠标位置为中心缩放画布 |
| 单击左侧节点列表 | 平滑聚焦并自适应缩放到对应节点 |
| 单击 From/To 条目 | 平滑聚焦目标卡片并显示临时呼吸轮廓 |

输入框、文本域、下拉框和可编辑文本保留系统原生快捷键行为。

## VS Code 命令

| 命令 | 用途 |
| --- | --- |
| `MindFlow: 新建空白画布` | 打开一个未命名的空白 MindFlow |
| `MindFlow: 打开产品流程` | 打开本地 `.mindflow` 文件 |
| `MindFlow: 画布另存为...` | 将当前画布保存到指定位置 |
| `MindFlow: 校验画布 JSON` | 校验当前文档结构和引用 |
| `MindFlow: 复制全局 MCP 配置` | 复制全局 stdio MCP 配置 |
| `MindFlow: 导出 Agent Skills` | 导出与当前扩展版本匹配的产品分析 Skills |
| `MindFlow: 查看 MCP 连接状态` | 查看 Router、运行时、Host 和会话诊断 |

## 接入 MCP

MindFlow 没有客户端插件或通用的零配置发现机制。安装扩展后，需要为具有 Agent 能力的 AI CLI 手动注册一次全局 MCP Router：

1. 启动一个本地 VS Code 窗口，工作区文件夹可选。
2. 执行 `MindFlow: 复制全局 MCP 配置`。
3. 将复制得到的 `mcpServers.mindflow` 配置加入 Agent CLI 的用户级或全局 MCP 配置。
4. 重启或刷新 Agent 的 MCP Server。
5. 先调用 `mindflow_list_hosts`，再调用 `mindflow_get_open_editors`。

Router 安装位置：

- macOS/Linux：`~/.mindflow/mcp/runtime/mindflow-mcp-router.cjs`
- Windows：`%LOCALAPPDATA%/MindFlow/mcp/runtime/mindflow-mcp-router.cjs`

复制的配置只包含经过验证的运行命令和稳定 Router 路径，不包含工作区路径、Host ID、端口或令牌。多个 VS Code Host 同时存在时，应优先使用精确的 `flowUri`；任何可能改变编辑器、文档或窗口状态的调用都需要明确的 `flowUri` 或 `hostId`。

## Agent Skills 与渐进式产品分析

VSIX 内置六个可独立导出的 Agent Skills：

- `mindflow-product-analysis`
- `mindflow-task-orchestrator`
- `mindflow-canvas-authoring`
- `mindflow-from-documents`
- `mindflow-from-code`
- `mindflow-from-canvas`

执行 `MindFlow: 导出 Agent Skills` 后，将生成 `mindflow-agent-skills/` 目录，用户再按目标 Agent CLI 的规则安装或复制这些 Skills。

一次完整分析会在 `.mindflow/tasks/YYYYMMDD-HHmmss-short-slug/` 下建立可恢复任务，记录需求台账、分析分片、跨分片综合、实体索引、渐进式写入计划、检查点和校验报告。标准流程为：

1. 盘点输入文档或代码范围；
2. 分片完成证据化分析；
3. 汇总跨分片依赖和冲突；
4. 设计画布实体与关系；
5. 按小批次 dry-run、写入、聚焦和复核；
6. 完成全量校验，或转交 PRD、HTML、Figma、Pencil 等下游产物任务。

正式画布生成必须等待分析分片和综合完成。MindFlow MCP 只提供读取和操作能力，不替代 Skills 中的产品分析规则。

## 本地文件与安全边界

- MindFlow 可以打开工作区内外的绝对本地 `.mindflow` 路径。
- MCP 首次访问工作区外文件时默认询问；可通过 `mindflow.security.externalFileAccess` 设置为 `prompt`、`allow` 或 `workspaceOnly`。
- 外部路径会解析真实物理路径，工作区符号链接不能绕过访问策略。
- 相对路径、非 `.mindflow` 文件、远程 URI 和虚拟文件系统 URI 会被拒绝。
- 如果同一物理文件在多个 Host 中打开，显式 Host 读取仍可执行，但可能产生歧义的写入会被拒绝。
- 当前格式是严格格式，不提供旧字段兼容或自动迁移；过时字段会导致校验失败。

## 开发与构建

```bash
npm install
npm run compile
npm test
```

按 `F5` 启动 Extension Host。主要源码边界：

- `src/product-flow/domain`：模型、校验、序列化和编辑原语
- `src/product-flow/application/operations`：VS Code 与 MCP 共用的原子操作
- `src/product-flow/infrastructure`：本地持久化
- `src/platform/vscode`、`src/platform/mcp`、`src/platform/webview`：平台适配层
- `agent-assets`：随 VSIX 分发的 Skills、模板、Schema 和确定性校验脚本

完整检查：

```bash
npm run check
```

构建 VSIX：

```bash
npm run package
```

主分支的成功 CI 会生成带内部递增版本号和 SHA-256 校验文件的 GitHub Pre-release。

## 反馈与源码

- 源码仓库：[WangTW98/MindFlow](https://github.com/WangTW98/MindFlow)
- 问题反馈：[GitHub Issues](https://github.com/WangTW98/MindFlow/issues)
- 版本下载：[GitHub Releases](https://github.com/WangTW98/MindFlow/releases)

建议的 GitHub About 简介：

> 面向产品经理的结构化产品思维画布：在 VS Code 中用节点、连线、应用形态、业务域、角色与状态描述产品，并通过 MCP 与 Agent Skills 支持 AI 辅助分析和渐进式编辑。

建议 Topics：`vscode-extension`、`product-management`、`mind-map`、`product-design`、`workflow`、`mcp`、`agent-skills`。

## License

Copyright (c) 2026 MindFlow contributors.

MindFlow 仅依据 [GNU Affero General Public License Version 3](LICENSE.txt) 授权，对应 SPDX 标识 `AGPL-3.0-only`。当前版本的完整源码位于 [MindFlow GitHub 仓库](https://github.com/WangTW98/MindFlow)。如果修改 MindFlow 并允许用户通过网络与修改后的程序交互，请特别核对许可证第 13 节规定的对应源码义务。
