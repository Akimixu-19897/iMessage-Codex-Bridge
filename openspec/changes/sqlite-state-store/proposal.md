# 提案：SQLite 状态存储改造

## 背景

当前 bridge 的运行态数据集中写入 `data/bridge-state.json`。随着联系人会话、后台任务、任务日志、附件记录、消息去重记录不断增长，单文件 JSON 会逐渐变得脆弱：写入粒度过大、日志膨胀明显、状态损坏后需要人工修复，生产运行时的恢复能力也有限。

项目运行模式是单用户、单机器、macOS 本机常驻服务，核心依赖本地 Messages 权限、`imsg` 和当前登录用户会话。因此 SQLite 更适合作为本地持久化层，不需要引入 PostgreSQL 或 MySQL 这类独立服务。

## 目标

- 用 `data/bridge.db` 承载运行态数据，并支持通过 `BRIDGE_DB_PATH` 覆盖路径。
- 提供 JSON 到 SQLite 的显式迁移工具，确保已有状态可安全导入。
- 迁移后正常运行不再持续增长 `bridge-state.json`。
- 保持 `/jobs`、`/status`、`/logs`、`/cancel`、前台任务、后台任务、重启恢复等现有行为不变。
- 对任务创建、任务状态更新、任务日志追加等多行写入使用 SQLite transaction。

## 非目标

- 第一版不引入 PostgreSQL、MySQL 或外部数据库服务。
- 第一版不实现多设备同步、远程管理后台或多用户隔离模型。
- 第一版不要求一次性把所有状态写入路径都改成最优 SQL 增量写入；允许先用快照仓库降低迁移风险，再优化任务与日志路径。

## macOS 权限前提

- bridge 仍然运行在本机 macOS 用户会话中。
- Messages、`imsg`、Codex CLI/app-server、launchd 权限模型不因本变更改变。
- 正式迁移生产状态前，需要先停止 launchd 服务，备份 `bridge-state.json`，迁移完成后再启动服务。

## 风险

- `better-sqlite3` 是 native dependency，本机或 CI 安装可能失败。
- 迁移映射如果不完整，可能丢失任务日志、会话或去重记录。
- 如果生产服务仍在写 JSON 时执行迁移，可能产生数据不一致。
- 初始快照式 SQLite 仓库会牺牲部分写入效率，需要后续用任务和日志增量写入优化。
