# iMessage Codex Bridge

本项目是在单台 macOS 上运行的本地 bridge：用 `imsg` 监听 iMessage 入站消息，把白名单联系人的文本与图片输入转给 `Codex app-server`，再把文本回复回发到原会话，并支持管理员通过 iMessage 动态管理联系人和 workspace。

## 当前能力

- 白名单联系人接入，非白名单固定回复 `请联系管理员开通权限。`
- 一联系人一持久 Codex 线程，一联系人一默认 workspace
- 管理员可通过 iMessage 动态执行 `allow`、`list`、`workspace`、`remove`
- 短窗口连续消息合并，支持文本与图片一起进入同一轮提交
- 本机自发消息过滤、重复消息去重
- 图片本地暂存到 `data/attachments/`，再以 `localImage` 提交给 Codex
- `Codex app-server` 失败时自动回复可读降级文案
- 附件暂存失败、`imsg send` 失败会记录错误日志并尽量继续主流程

## 运行前提

- macOS，且本机 Messages / iMessage 已正常登录
- 已安装 `imsg` 0.5.x，并已授予终端 / Codex 所需的消息与磁盘权限
- 已安装 `codex` CLI，并可执行 `codex app-server --listen stdio://`
- Node.js / npm 通过 `volta` 管理

## 配置

示例配置位于 `config/bridge.example.yaml`：

```yaml
rejectionMessage: 请联系管理员开通权限。
messageMergeWindowMs: 5000
adminHandles:
  - "+8618352869601"
contacts:
  - handle: "+8618352869601"
    name: 管理员
    workspace: "/Users/akimixu/Desktop/Projects/imessage-codex-bridge"
  - handle: "+8613800000000"
    name: 示例联系人
    workspace: "/Users/akimixu/Desktop/Projects/imessage-codex-bridge"
```

字段说明：

- `rejectionMessage`：非白名单联系人收到的固定回复
- `messageMergeWindowMs`：同一联系人碎片消息合并窗口
- `adminHandles`：允许执行管理员命令的联系人标识列表；未配置时默认允许现有白名单联系人执行
- `contacts[].handle`：白名单联系人标识
- `contacts[].workspace`：该联系人对应的默认 Codex 工作目录

## 启动

```bash
volta run npm install
volta run npm run build
volta run npm run dev
```

默认运行路径：

- 状态文件：`data/bridge-state.json`
- 图片暂存目录：`data/attachments/`

启动成功后，bridge 会：

1. 校验配置与 `imsg` 可用性
2. 拉起本地 `codex app-server`
3. 恢复 `data/bridge-state.json` 中已有的联系人线程映射
4. 用 `imsg watch --json --attachments` 监听入站消息，并在进程内执行管理员命令 / 白名单过滤

## 管理员命令

管理员可直接给本机 iMessage 发送以下命令：

```text
/bridge list
/bridge allow <handle> <name> <workspace>
/bridge workspace <handle> <workspace>
/bridge remove <handle>
/bridge help
```

说明：

- 含空格的 `name` 或 `workspace` 请用引号包裹
- `allow` 会新增联系人；若联系人已存在，则覆盖其名称和 workspace
- `workspace` 只更新已有联系人的默认工作目录
- 动态变更会直接写入 `data/bridge-state.json`，重启后仍然保留

## 验证

```bash
volta run npm test
volta run npm run build
```

## 已知限制

- 当前仅支持一对一联系人，不支持群聊
- 当前只支持图片入站理解，不支持图片生成或图片回传
- 附件关联记录当前按合并批次的末条消息 ID 落盘，适合第一版自用，不适合做精细审计
- `imsg send` 失败只记录日志，不做自动重试队列
- 状态文件损坏时会直接报错退出，需要人工修复 `data/bridge-state.json`
