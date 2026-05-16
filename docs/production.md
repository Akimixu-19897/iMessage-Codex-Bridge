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

如果 `imsg`、`codex`、配置文件、状态目录或 workspace 不可用，脚本会停止安装，避免 launchd 不断拉起一个必然失败的进程。

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

| 项目   | 路径                       |
| ------ | -------------------------- |
| 配置   | `config/bridge.local.yaml` |
| 状态   | `data/bridge-state.json`   |
| 附件   | `data/attachments`         |
| stdout | `logs/bridge.out.log`      |
| stderr | `logs/bridge.err.log`      |

## 为什么不用 Docker

Docker Desktop 的 Linux 容器无法直接使用 macOS Messages 数据库、系统自动化权限和当前登录用户的 iMessage 会话。这个 bridge 的关键依赖都在宿主 macOS 用户会话里，放进容器会让 `imsg watch` 和 `imsg send` 这条链路不稳定甚至不可用。

如果未来要容器化，比较现实的拆分方式是：macOS 宿主机只跑一个很薄的 `imsg` sidecar，Docker 容器跑纯业务 bridge，两者通过本机 socket 通信。但当前代码还不是这个架构。
