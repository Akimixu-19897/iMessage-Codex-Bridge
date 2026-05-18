# SQLite 状态存储改造实施计划

> **给执行者：** 实施本计划时，请按任务逐步执行，并在每个任务完成后运行对应验证命令。

**目标：** 用 SQLite 替换当前单文件 `bridge-state.json` 运行态存储，保留现有行为，同时提升持久化可靠性，并避免任务日志和历史记录持续撑大 JSON 文件。

**架构：** 先增加存储边界和 SQLite 初始化能力，再提供从 JSON 到 SQLite 的迁移工具。第一阶段不直接切换生产运行时，先保证现有 `bridge-state.json` 能安全导入 `data/bridge.db`；确认迁移可靠后，再逐步把运行时读写切到 SQLite。

**技术栈：** TypeScript、Vitest、`better-sqlite3`、Zod、macOS launchd 本机生产运行。

---

## 设计摘要

这个项目是单用户、单机器的 macOS 本机服务，所以推荐使用 SQLite，而不是 PostgreSQL 或 MySQL。默认数据库文件为 `data/bridge.db`，并通过 `BRIDGE_DB_PATH` 支持覆盖。

当前 `bridge-state.json` 在迁移期保留为数据来源和备份。迁移完成后，运行时状态应从 SQLite 读取和写入。

建议表结构：

```sql
CREATE TABLE contacts (
  handle TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace TEXT NOT NULL,
  current_session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  handle TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  workspace TEXT NOT NULL,
  thread_id TEXT,
  last_active_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (handle, id),
  FOREIGN KEY (handle) REFERENCES contacts(handle) ON DELETE CASCADE
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  session_id TEXT,
  mode TEXT NOT NULL,
  workflow TEXT NOT NULL,
  prompt TEXT NOT NULL,
  title TEXT NOT NULL,
  source_message_ids TEXT NOT NULL,
  attachment_paths TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  current_stage TEXT,
  summary TEXT,
  error_message TEXT,
  thread_id TEXT,
  turn_id TEXT,
  last_heartbeat_at INTEGER,
  next_heartbeat_at INTEGER,
  slow_notice_sent_at INTEGER
);

CREATE TABLE job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  message TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE attachments (
  message_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  thread_id TEXT,
  source_path TEXT NOT NULL,
  staged_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, staged_path)
);

CREATE TABLE processed_messages (
  message_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE outbound_messages (
  message_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

`nextJobSequence` 存入 `metadata`，键名使用 `next_job_sequence`。

## 行为要求

- 现有 `bridge-state.json` 必须能完整迁移，不能丢失联系人、会话、任务、任务日志、附件记录、消息去重记录和已发送消息记录。
- `/jobs`、`/status`、`/logs`、`/cancel`、前台任务、后台任务、重启恢复在迁移后行为保持一致。
- `/logs <jobId>` 从 `job_logs` 查询最近 10 条日志。
- 启用 SQLite 后，`bridge-state.json` 不应在正常运行中继续增长。
- 创建任务、追加任务日志、更新任务状态等多行写入必须放在 SQLite transaction 里。
- 生产部署文档需要说明 `BRIDGE_DB_PATH` 和 `data/bridge.db`。

## 发布策略

1. 添加 SQLite 支持，同时保持现有 JSON 测试通过。
2. 添加显式迁移命令。
3. 用当前 `data/bridge-state.json` 做本地迁移演练。
4. 再把生产 launchd 切换到 `BRIDGE_DB_PATH=data/bridge.db`。
5. 至少保留一版 `bridge-state.json` 作为备份。

## 任务 1：添加 SQLite 依赖和配置入口

**文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`src/main.ts`
- 修改：`src/doctor.ts`
- 修改：`src/doctor-cli.ts`
- 测试：`tests/main.test.ts`
- 测试：`tests/doctor.test.ts`

**步骤 1：先写失败测试**

新增测试断言 `runMain()` 会把数据库路径传给启动逻辑：

```ts
expect(startBridge).toHaveBeenCalledWith(
  expect.objectContaining({
    databasePath: "/tmp/bridge.db"
  })
);
```

新增 `doctor` 测试断言数据库路径被检查：

```ts
expect(result.checks).toContainEqual({
  name: "database",
  ok: true,
  detail: "/tmp/bridge.db"
});
```

**步骤 2：运行测试确认失败**

```bash
/opt/homebrew/bin/volta run npm test -- tests/main.test.ts tests/doctor.test.ts
```

预期：失败，因为 `databasePath` 和 database doctor check 还不存在。

**步骤 3：安装依赖**

```bash
/opt/homebrew/bin/volta run npm install better-sqlite3
/opt/homebrew/bin/volta run npm install --save-dev @types/better-sqlite3
```

**步骤 4：实现配置透传**

新增默认路径：

```ts
const DEFAULT_DATABASE_PATH = new URL("../data/bridge.db", import.meta.url).pathname;
```

读取环境变量：

```ts
const databasePath = env.BRIDGE_DB_PATH ?? DEFAULT_DATABASE_PATH;
```

把 `databasePath` 传给 `startLocalBridge()`。

**步骤 5：验证**

```bash
/opt/homebrew/bin/volta run npm test -- tests/main.test.ts tests/doctor.test.ts
```

预期：通过。

## 任务 2：创建 SQLite schema 和初始化逻辑

**文件：**

- 新建：`src/state/sqlite-schema.ts`
- 新建：`src/state/sqlite-store.ts`
- 新建：`tests/state/sqlite-store.test.ts`

**步骤 1：先写失败测试**

测试创建临时数据库，并断言关键表存在：

```ts
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
expect(tables.map((row) => row.name)).toEqual(
  expect.arrayContaining([
    "contacts",
    "sessions",
    "jobs",
    "job_logs",
    "attachments",
    "processed_messages",
    "outbound_messages",
    "metadata"
  ])
);
```

**步骤 2：运行测试确认失败**

```bash
/opt/homebrew/bin/volta run npm test -- tests/state/sqlite-store.test.ts
```

预期：失败，因为 SQLite store 还不存在。

**步骤 3：实现 schema 初始化**

创建 `initializeSqliteStore(databasePath: string)`：

- 打开 SQLite 数据库。
- 执行 `PRAGMA foreign_keys = ON`。
- 在一个 transaction 中执行所有 `CREATE TABLE IF NOT EXISTS`。

**步骤 4：验证**

```bash
/opt/homebrew/bin/volta run npm test -- tests/state/sqlite-store.test.ts
```

预期：通过。

## 任务 3：添加 JSON 到 SQLite 的迁移工具

**文件：**

- 修改：`src/state/sqlite-store.ts`
- 新建：`src/state/migrate-json-to-sqlite.ts`
- 新建：`src/migrate-state-cli.ts`
- 测试：`tests/state/migrate-json-to-sqlite.test.ts`

**步骤 1：先写失败测试**

构造一个代表性的 `BridgeState`，包含：

- 2 个联系人
- 多个会话
- 2 个带日志的任务
- processed messages
- outbound messages
- attachments

断言迁移后所有行都写入 SQLite，并且 `nextJobSequence` 被保留。

**步骤 2：运行测试确认失败**

```bash
/opt/homebrew/bin/volta run npm test -- tests/state/migrate-json-to-sqlite.test.ts
```

预期：失败，因为迁移器还不存在。

**步骤 3：实现迁移函数**

实现：

```ts
export function migrateBridgeStateToSqlite(params: {
  state: BridgeState;
  databasePath: string;
  overwrite?: boolean;
}): void;
```

要求：

- 使用一个 transaction 完成全部迁移。
- 如果目标数据库已有数据且 `overwrite !== true`，抛出清晰错误。
- 数组字段如 `sourceMessageIds`、`attachmentPaths` 暂时用 JSON 字符串存储。

**步骤 4：添加 CLI**

命令形态：

```bash
/opt/homebrew/bin/volta run tsx src/migrate-state-cli.ts \
  --state data/bridge-state.json \
  --database data/bridge.db
```

**步骤 5：验证**

```bash
/opt/homebrew/bin/volta run npm test -- tests/state/migrate-json-to-sqlite.test.ts
```

预期：通过。

## 任务 4：引入状态仓库接口

**文件：**

- 新建：`src/state/bridge-state-repository.ts`
- 修改：`src/bridge/local-bridge-runtime.ts`
- 修改：`src/bridge/start-local-bridge.ts`
- 测试：`tests/state/bridge-state-repository.test.ts`

**步骤 1：定义仓库接口**

先从现有运行时最容易接入的快照接口开始：

```ts
export type BridgeStateRepository = {
  loadSnapshot(): BridgeState;
  saveSnapshot(state: BridgeState): Promise<void>;
};
```

这样第一轮 SQLite 接入风险较低：现有 manager 仍然可以操作内存里的 `BridgeState`，只是底层持久化可以切换。

**步骤 2：添加 JSON 实现**

封装现有 `loadBridgeState` 和 `saveBridgeState`。

**步骤 3：添加 SQLite 实现**

`loadSnapshot()` 从 SQLite 表还原成当前 `BridgeState` 结构。

`saveSnapshot()` 在一个 transaction 里替换 SQLite 表内容。

这不是最终最高效的架构，但可以先保证行为等价，再逐步优化写入路径。

**步骤 4：验证**

```bash
/opt/homebrew/bin/volta run npm test -- tests/state/bridge-state-repository.test.ts tests/bridge/local-bridge-runtime.test.ts
```

预期：通过。

## 任务 5：运行时切换到 SQLite 快照持久化

**文件：**

- 修改：`src/bridge/start-local-bridge.ts`
- 修改：`src/bridge/local-bridge-runtime.ts`
- 测试：`tests/bridge/start-local-bridge.test.ts`
- 测试：`tests/bridge/local-bridge-runtime.test.ts`

**步骤 1：先写失败测试**

新增测试传入 `databasePath`，并断言 SQLite repository 被使用。

**步骤 2：实现选择逻辑**

默认规则：

- 如果 `BRIDGE_DB_PATH` 存在，或 `BRIDGE_USE_SQLITE=1`，使用 SQLite。
- 否则继续使用 JSON，保证向后兼容。

迁移后推荐生产配置：

```bash
BRIDGE_USE_SQLITE=1
BRIDGE_DB_PATH=/Users/akimixu/Desktop/Projects/imessage-codex-bridge/data/bridge.db
```

**步骤 3：验证**

```bash
/opt/homebrew/bin/volta run npm test -- tests/bridge/start-local-bridge.test.ts tests/bridge/local-bridge-runtime.test.ts
```

预期：通过。

## 任务 6：优化任务和日志写入，避免全量快照重写

**文件：**

- 修改：`src/bridge/job-manager.ts`
- 新建：`src/bridge/sqlite-job-manager.ts`
- 测试：`tests/bridge/sqlite-job-manager.test.ts`

**步骤 1：先写失败测试**

测试覆盖：

- 创建任务会插入 1 行 `jobs` 和 1 行 `job_logs`。
- `markCompleted` 会更新 `jobs` 并追加 1 行 `job_logs`。
- `/logs` 会按顺序返回最近 10 条日志。
- slow notice 只追加一次日志，不会重复提醒。

**步骤 2：实现 SQLite job manager**

使用聚焦的 SQL 更新，而不是每次重写整个状态。当前内存版 job manager 先保留为 fallback，直到所有运行态都迁移到 SQLite。

**步骤 3：验证**

```bash
/opt/homebrew/bin/volta run npm test -- tests/bridge/sqlite-job-manager.test.ts tests/bridge/bridge-codex-executor.test.ts
```

预期：通过。

## 任务 7：添加保留策略和清理机制

**文件：**

- 新建：`src/state/retention.ts`
- 新建：`tests/state/retention.test.ts`
- 修改：`README.md`
- 修改：`docs/production.md`

**步骤 1：先写失败测试**

断言清理逻辑可以：

- 删除早于 N 天的已完成任务。
- 每个联系人保留最近 N 个已完成任务。
- 活跃任务的日志不能被清理。

**步骤 2：实现清理逻辑**

默认建议：

```text
活跃任务永久保留
completed/failed/cancelled 任务保留 30 天
最多保留 200 个已结束任务
```

通过环境变量配置：

```bash
BRIDGE_JOB_RETENTION_DAYS=30
BRIDGE_MAX_COMPLETED_JOBS=200
```

**步骤 3：验证**

```bash
/opt/homebrew/bin/volta run npm test -- tests/state/retention.test.ts
```

预期：通过。

## 任务 8：更新生产部署

**文件：**

- 修改：`scripts/run-production.sh`
- 修改：`deploy/launchd/com.akimixu.imessage-codex-bridge.plist`
- 修改：`docs/production.md`
- 修改：`README.md`

**步骤 1：更新 launchd 环境变量**

加入：

```xml
<key>BRIDGE_USE_SQLITE</key>
<string>1</string>
<key>BRIDGE_DB_PATH</key>
<string>/Users/akimixu/Desktop/Projects/imessage-codex-bridge/data/bridge.db</string>
```

**步骤 2：记录迁移命令**

文档中加入：

```bash
/opt/homebrew/bin/volta run tsx src/migrate-state-cli.ts \
  --state data/bridge-state.json \
  --database data/bridge.db
./scripts/install-launchd.sh
```

**步骤 3：验证 launchd 文件**

```bash
plutil -lint deploy/launchd/com.akimixu.imessage-codex-bridge.plist
bash -n scripts/run-production.sh scripts/install-launchd.sh scripts/uninstall-launchd.sh
```

预期：全部通过。

## 最终验证

运行：

```bash
/opt/homebrew/bin/volta run npm run check
/opt/homebrew/bin/volta run npm run doctor
plutil -lint deploy/launchd/com.akimixu.imessage-codex-bridge.plist
bash -n scripts/*.sh
```

再做本地迁移演练：

```bash
cp data/bridge-state.json .tmp/bridge-state.backup.json
/opt/homebrew/bin/volta run tsx src/migrate-state-cli.ts \
  --state .tmp/bridge-state.backup.json \
  --database .tmp/bridge-test.db
```

预期：

- `bridge-test.db` 存在。
- contacts 数量与 JSON 一致。
- jobs 数量与 JSON 一致。
- job logs 数量与 JSON 一致。
- `/logs` 相关测试在 SQLite 下通过。

## 提交计划

建议小步提交：

```bash
git commit -m "build: 添加 SQLite 依赖"
git commit -m "feat: 添加 SQLite 状态库"
git commit -m "feat: 支持 JSON 状态迁移到 SQLite"
git commit -m "refactor: 抽象 bridge 状态仓库"
git commit -m "feat: 使用 SQLite 持久化任务日志"
git commit -m "docs: 更新 SQLite 生产部署说明"
```

## 风险和缓解

- **风险：** `better-sqlite3` 是 native dependency，本地或 CI 安装可能失败。
  **缓解：** CI 使用 `macos-latest`，本地和 CI 都先验证 `npm ci`。

- **风险：** 迁移时丢失任务日志或会话。
  **缓解：** 迁移测试必须比较行数和代表性字段，尤其是 contacts、sessions、jobs、job_logs。

- **风险：** 生产服务运行时还在写 JSON，迁移同时发生会产生不一致。
  **缓解：** 正式迁移前先停止 launchd，备份 JSON，迁移完成后再启动。

- **风险：** 初始 SQLite 实现如果采用全量快照替换，效率不够高。
  **缓解：** 短期接受这个低风险过渡方案，随后在任务 6 中优化 jobs 和 job_logs 的增量写入。

## 推荐第一阶段

先只做任务 1 到任务 3：

1. 添加 SQLite 依赖和配置。
2. 创建 schema。
3. 构建 JSON 到 SQLite 的迁移 CLI。

这样可以先拿到安全可验证的迁移工具，不会马上影响当前已经运行的生产服务。
