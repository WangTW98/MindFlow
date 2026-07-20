# MindFlow 产品思维画布

MindFlow 是一款面向产品经理的本地 VS Code 结构化思维画布。它使用节点、连线、应用形态、业务域、角色、权限和状态描述产品，让产品综述、信息架构、页面功能、业务流程与异常状态能够在同一张画布中被编辑、检查和追踪。

MindFlow 同时提供 MCP 读取与编辑能力，以及六个可导出的 Agent Skills。外部 Agent 可以基于文档、代码或已有 `.mindflow` 进行产品分析，再以可审阅的小批次渐进写入画布。MindFlow 本身不内置大模型、AI SDK、文档解析器或代码扫描器。

## 适用场景

- 从需求文档梳理产品结构、页面、功能和业务状态。
- 通过应用形态、业务域、角色与权限核对产品覆盖范围。
- 检查页面跳转、交互、数据流、状态变化与结构包含关系。
- 在产品评审中逐项定位节点、连线和 From/To 关联卡片。
- 让外部 Agent 读取、理解并渐进编辑用户可见、可撤销的产品画布。

## 安装

MindFlow 当前通过 GitHub Release 分发 VSIX，尚未发布到 VS Code Marketplace。

1. 前往 [GitHub Releases](https://github.com/WangTW98/MindFlow/releases) 下载最新 Pre-release 中的 `.vsix` 文件。
2. 在 VS Code 中执行“扩展：从 VSIX 安装...”。
3. 选择下载的 VSIX 并按提示重新加载窗口。

也可以使用命令行：

```bash
code --install-extension mindflow-canvas-editor-<version>-<sha12>.vsix --force
```

要求 VS Code `1.92.0` 或更高版本，并使用本地桌面窗口。当前不支持 Remote SSH、WSL、Dev Container 和虚拟文件系统路径。

## 三步开始

1. 打开命令面板，执行 `MindFlow: 新建空白画布`。
2. 编辑唯一的产品综述根节点，并创建应用形态、页面、弹窗、组件或业务状态节点。
3. 使用连线表达交互、自动跳转、数据流、状态变化或结构包含关系，检查完成后保存 `.mindflow` 文件。

## 主要能力

- 唯一产品综述根节点，以及从根节点展开的产品结构。
- Web、App、小程序、桌面端、管理后台等应用形态。
- 骨架、导航、页面、弹窗、组件和独立状态节点。
- 业务域、角色、权限、状态组和详细功能分组绑定。
- `interaction`、`autoNavigate`、`dataFlow`、`statusChange`、`nestedRelation` 五类连线。
- 右侧详情编辑、分类筛选、节点搜索和严格 JSON 校验。
- 普通节点多选、整体拖动、批量删除和跨文档复制粘贴。
- 基于真实卡片尺寸的自动排版，以及平滑、自适应的节点聚焦。
- From/To 关联定位与不改变选择状态的临时呼吸高亮。
- MCP 分页读取、子图查询、路径跟踪、原子批量编辑、dry-run 和渐进式写入。

## 常用交互与快捷键

| 操作 | 结果 |
| --- | --- |
| 单击节点 | 选择节点并打开对应详情 |
| `Cmd/Ctrl/Shift` + 单击 | 增加或移除普通节点多选 |
| `Cmd/Ctrl+A` | 选择全部未删除的普通节点 |
| 拖动任意已选节点 | 整体移动当前多选节点 |
| `Cmd/Ctrl+C` | 复制当前选中的普通节点 |
| `Cmd/Ctrl+V` | 在画布内当前鼠标位置粘贴节点 |
| `Delete` 或 `Backspace` | 批量删除已选普通节点 |
| 双击标题，或按 `Enter`/`F2` | 编辑卡片标题 |
| 滚轮/触控板滚动 | 平移画布 |
| `Cmd/Ctrl` + 滚轮 | 以鼠标位置为中心缩放 |

根节点、应用形态和连线不参与普通节点的全选、复制粘贴或整体拖动。输入控件继续使用系统原生快捷键。

## 命令

| 命令 | 用途 |
| --- | --- |
| `MindFlow: 新建空白画布` | 打开未命名的空白 MindFlow |
| `MindFlow: 打开产品流程` | 打开任意本地 `.mindflow` 文件 |
| `MindFlow: 画布另存为...` | 将当前画布保存到指定位置 |
| `MindFlow: 校验画布 JSON` | 校验结构、枚举和实体引用 |
| `MindFlow: 复制全局 MCP 配置` | 复制 Agent CLI 所需的全局 stdio Router 配置 |
| `MindFlow: 导出 Agent Skills` | 导出与当前扩展版本匹配的六个 Skills |
| `MindFlow: 查看 MCP 连接状态` | 查看 Router、运行时、Host 和会话诊断 |

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `mindflow.storage.flowDirectory` | `.mindflow/flows` | 工作区内默认的 MindFlow 文件存放目录 |
| `mindflow.security.externalFileAccess` | `prompt` | 控制 MCP 对工作区外本地 `.mindflow` 文件的访问策略 |

`externalFileAccess` 可设置为：

- `prompt`：访问前询问用户；
- `allow`：允许访问工作区外的本地 `.mindflow` 文件；
- `workspaceOnly`：只允许访问当前工作区内的文件。

## MCP 与 Agent Skills

安装扩展并启动本地 VS Code 窗口后：

1. 执行 `MindFlow: 复制全局 MCP 配置`。
2. 将 `mcpServers.mindflow` 加入具有 Agent 能力的 AI CLI 用户级或全局 MCP 配置。
3. 重启或刷新 MCP Server，先调用 `mindflow_list_hosts`，再调用 `mindflow_get_open_editors`。

如需产品分析工作流，再执行 `MindFlow: 导出 Agent Skills`，将生成的 `mindflow-agent-skills/` 按目标 Agent CLI 的规则安装。内置 Skills 支持文档分析、代码分析、现有画布理解、产品分析、任务恢复和渐进式画布写入。

MCP 修改的是 VS Code 当前打开的文档，不会自动保存 `.mindflow` 文件。用户可以在保存前检查、撤销或继续调整 AI 的变更。

## 安全与限制

- 只接受绝对本地 `.mindflow` 路径；相对路径、远程 URI 和虚拟文件系统 URI 会被拒绝。
- 工作区外文件默认需要用户授权，并按真实物理路径检查。
- 同一文件在多个 VS Code Host 中打开时，可能产生歧义的写入会被拒绝。
- 当前数据格式严格，不提供旧字段自动迁移。
- MindFlow 提供画布能力和 Agent Skills，不提供内置 AI 服务；用户需要自行准备支持 MCP 与 Skills 的 Agent CLI。

## 源码、反馈与许可

- 源码：[WangTW98/MindFlow](https://github.com/WangTW98/MindFlow)
- 问题反馈：[GitHub Issues](https://github.com/WangTW98/MindFlow/issues)
- VSIX 下载：[GitHub Releases](https://github.com/WangTW98/MindFlow/releases)

MindFlow 仅按 [GNU Affero General Public License Version 3](https://github.com/WangTW98/MindFlow/blob/main/LICENSE.txt) 授权，对应 SPDX 标识 `AGPL-3.0-only`。完整源码可从 [MindFlow GitHub 仓库](https://github.com/WangTW98/MindFlow) 获取。
