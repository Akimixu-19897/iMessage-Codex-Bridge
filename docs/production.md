# 本机生产部署

这个项目依赖 macOS Messages/iMessage、`imsg` 和本机 `codex app-server`。标准 Docker 容器无法直接获得 macOS Messages 权限，因此生产运行推荐使用 macOS `launchd`，让 bridge 作为当前登录用户的常驻服务运行。

## 部署方式

```bash
cd /Users/akimixu/Desktop/Projects/imessage-codex-bridge
/opt/homebrew/bin/volta run npm install
/opt/homebrew/bin/volta run npm run check
./scripts/install-launchd.sh
```

安装脚本会先执行：

```bash
npm run doctor
```

如果 `imsg`、`codex`、配置文件、状态目录、SQLite 数据库目录或 workspace 不可用，脚本会停止安装，避免 launchd 不断拉起一个必然失败的进程。

## 服务管理

查看状态：

```bash
launchctl print gui/$(id -u)/com.akimixu.imessage-codex-bridge
```

手动停止服务：

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.akimixu.imessage-codex-bridge.plist
```

停止后重新启动：

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.akimixu.imessage-codex-bridge.plist
launchctl kickstart -k gui/$(id -u)/com.akimixu.imessage-codex-bridge
```

重启服务：

```bash
launchctl kickstart -k gui/$(id -u)/com.akimixu.imessage-codex-bridge
```

停止并卸载：

```bash
./scripts/uninstall-launchd.sh
```

活动监视器里可能看到的进程名包括 `node`、`tsx`、`npm`、`volta-shim`、`imsg`、`codex`。更准确的判断方式还是看 `launchctl print` 里的 `state = running` 和 `pid = ...`。

## 日志

```bash
tail -f logs/bridge.out.log logs/bridge.err.log
```

默认日志级别为 `info`，不会打印 iMessage 正文。需要排查原始输入时，临时修改 `deploy/launchd/com.akimixu.imessage-codex-bridge.plist` 里的 `BRIDGE_LOG_LEVEL` 为 `debug`，再重新安装或重启服务。

## 运行路径

默认生产路径：

| 项目      | 路径                       |
| --------- | -------------------------- |
| 配置      | `config/bridge.local.yaml` |
| 状态库    | `data/bridge.db`           |
| JSON 备份 | `data/bridge-state.json`   |
| 附件      | `data/attachments`         |
| stdout    | `logs/bridge.out.log`      |
| stderr    | `logs/bridge.err.log`      |

## SQLite 状态库

生产环境默认启用 SQLite：

```bash
BRIDGE_USE_SQLITE=1
BRIDGE_DB_PATH=/Users/akimixu/Desktop/Projects/imessage-codex-bridge/data/bridge.db
```

`data/bridge-state.json` 在迁移后只作为备份来源保留，正常生产运行不会再持续写大 JSON 状态文件。任务日志会进入 `jobs` / `job_logs` 表，默认清理策略是：

```bash
BRIDGE_JOB_RETENTION_DAYS=30
BRIDGE_MAX_COMPLETED_JOBS=200
```

正式从 JSON 迁移到 SQLite 时，建议按这个顺序操作：

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.akimixu.imessage-codex-bridge.plist
cp data/bridge-state.json "data/bridge-state.$(date +%Y%m%d-%H%M%S).backup.json"
/opt/homebrew/bin/volta run tsx src/migrate-state-cli.ts \
  --state data/bridge-state.json \
  --database data/bridge.db \
  --overwrite
./scripts/install-launchd.sh
```

如果要先演练，不要直接操作生产库：

```bash
mkdir -p .tmp
cp data/bridge-state.json .tmp/bridge-state.backup.json
/opt/homebrew/bin/volta run tsx src/migrate-state-cli.ts \
  --state .tmp/bridge-state.backup.json \
  --database .tmp/bridge-test.db \
  --overwrite
```

回滚到 JSON 模式时，先停止服务，把 `BRIDGE_USE_SQLITE` 改成 `0` 或移除 `BRIDGE_DB_PATH`，再重新安装 launchd。回滚前请确认 `data/bridge-state.json` 是你希望恢复的那一版备份。

## 防止睡眠断线

生产启动脚本默认设置：

```bash
BRIDGE_PREVENT_SLEEP=1
```

这会用 `caffeinate -i` 包住 bridge 进程，阻止 macOS 因空闲进入系统睡眠，但不强制点亮屏幕。这样屏幕可以关闭，iMessage、`imsg watch` 和 `codex app-server` 仍能继续运行。

如果你临时不想阻止睡眠，可以把 `deploy/launchd/com.akimixu.imessage-codex-bridge.plist` 里的 `BRIDGE_PREVENT_SLEEP` 改成 `0`，然后重启服务。

当前机器的电源设置也会影响稳定性。建议生产运行时保持接电；如果使用电池，macOS 仍可能因为低电量、合盖或系统策略进入更深睡眠。

## 为什么不用 Docker

Docker Desktop 的 Linux 容器无法直接使用 macOS Messages 数据库、系统自动化权限和当前登录用户的 iMessage 会话。这个 bridge 的关键依赖都在宿主 macOS 用户会话里，放进容器会让 `imsg watch` 和 `imsg send` 这条链路不稳定甚至不可用。

如果未来要容器化，比较现实的拆分方式是：macOS 宿主机只跑一个很薄的 `imsg` sidecar，Docker 容器跑纯业务 bridge，两者通过本机 socket 通信。但当前代码还不是这个架构。
