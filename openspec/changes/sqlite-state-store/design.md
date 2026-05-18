# 设计：SQLite 状态存储

## 总体策略

采用渐进式迁移：

1. 增加 SQLite 依赖、配置入口和 doctor 检查。
2. 建立 SQLite schema 与初始化逻辑。
3. 提供 JSON 到 SQLite 的显式迁移 CLI。
4. 引入 `BridgeStateRepository`，先用快照方式保持运行时行为等价。
5. 在确认行为稳定后，把任务与日志写入改为聚焦 SQL 更新，避免频繁重写整个状态。
6. 更新生产 launchd 配置和文档，让生产环境默认使用 SQLite。

## 数据库路径

默认数据库路径：

```text
data/bridge.db
```

环境变量：

```text
BRIDGE_USE_SQLITE=1
BRIDGE_DB_PATH=/absolute/path/to/bridge.db
```

迁移期继续保留 `data/bridge-state.json` 作为数据来源和备份，但启用 SQLite 后，正常运行不应继续写大 JSON 状态文件。

## 核心表

- `contacts`：联系人、workspace、当前会话。
- `sessions`：联系人会话和 Codex thread 映射。
- `jobs`：后台任务主记录、状态、时间戳、阶段、结果。
- `job_logs`：任务日志，供 `/logs <jobId>` 查询最近记录。
- `attachments`：附件暂存映射。
- `processed_messages`：入站消息去重记录。
- `outbound_messages`：已发送消息记录，用于回环保护。
- `metadata`：全局序列号等元信息，例如 `next_job_sequence`。

## 存储边界

第一阶段接口：

```ts
export type BridgeStateRepository = {
  loadSnapshot(): BridgeState;
  saveSnapshot(state: BridgeState): Promise<void>;
};
```

这样可以先复用现有运行时内存模型，降低一次性改造风险。后续再为任务和日志引入 SQLite 专用 manager，改成增量 SQL 写入。

## 迁移规则

- 迁移必须在一个 transaction 中完成。
- 目标数据库已有数据且未显式 `overwrite` 时必须报错。
- 数组字段如 `sourceMessageIds`、`attachmentPaths` 第一版可用 JSON 字符串保存。
- `nextJobSequence` 存入 `metadata.next_job_sequence`。
- 迁移测试必须覆盖 contacts、sessions、jobs、job_logs、attachments、processed_messages、outbound_messages。

## 验收要求

- 现有 JSON 相关测试保持通过。
- SQLite schema、迁移器、仓库、运行时切换、任务日志增量写入均有自动化测试。
- `/jobs`、`/status`、`/logs`、`/cancel` 在 SQLite 下行为保持一致。
- 生产文档明确停止服务、备份 JSON、迁移、启用 SQLite、回滚方式。
