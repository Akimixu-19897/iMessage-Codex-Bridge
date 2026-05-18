# 任务：sqlite-state-store

## 阶段一：SQLite 依赖与配置入口

- [x] 添加 `better-sqlite3` 和 `@types/better-sqlite3` 依赖。
- [x] 在启动入口中增加默认数据库路径 `data/bridge.db`。
- [x] 支持 `BRIDGE_DB_PATH` 覆盖数据库路径。
- [x] 支持 `BRIDGE_USE_SQLITE=1` 作为运行时切换开关。
- [x] 将 `databasePath` 透传到 bridge 启动逻辑。
- [x] 在 doctor 检查中加入 database 路径与目录可写性检查。
- [x] 验证：`/opt/homebrew/bin/volta run npm test -- tests/main.test.ts tests/doctor.test.ts`。

## 阶段二：SQLite Schema 与初始化

- [x] 新建 SQLite schema 定义，覆盖 `contacts`、`sessions`、`jobs`、`job_logs`、`attachments`、`processed_messages`、`outbound_messages`、`metadata`。
- [x] 实现 `initializeSqliteStore(databasePath)`。
- [x] 初始化时启用 `PRAGMA foreign_keys = ON`。
- [x] 在 transaction 中执行所有 `CREATE TABLE IF NOT EXISTS`。
- [x] 为 schema 初始化补充测试，断言关键表均存在。
- [x] 验证：`/opt/homebrew/bin/volta run npm test -- tests/state/sqlite-store.test.ts`。

## 阶段三：JSON 到 SQLite 迁移工具

- [x] 实现 `migrateBridgeStateToSqlite({ state, databasePath, overwrite })`。
- [x] 迁移 contacts、sessions、jobs、job_logs、attachments、processed_messages、outbound_messages。
- [x] 将 `nextJobSequence` 写入 `metadata.next_job_sequence`。
- [x] 数组字段第一版以 JSON 字符串存储，并在读取时还原。
- [x] 目标数据库已有数据且未传 `overwrite` 时抛出清晰错误。
- [x] 新增 `src/migrate-state-cli.ts`，支持 `--state` 和 `--database` 参数。
- [x] 用代表性 `BridgeState` 编写迁移测试，覆盖行数和关键字段。
- [x] 验证：`/opt/homebrew/bin/volta run npm test -- tests/state/migrate-json-to-sqlite.test.ts`。

## 阶段四：状态仓库抽象

- [x] 新建 `BridgeStateRepository` 接口，提供 `loadSnapshot()` 和 `saveSnapshot(state)`。
- [x] 封装现有 JSON 读写为 `JsonBridgeStateRepository`。
- [x] 实现 `SqliteBridgeStateRepository`，可从 SQLite 还原当前 `BridgeState` 结构。
- [x] `saveSnapshot()` 使用 transaction 替换 SQLite 中的快照数据。
- [x] 将 local bridge runtime 改为依赖 repository，而不是直接依赖 JSON 文件。
- [x] 补充仓库等价性测试，确保同一份状态经 JSON 与 SQLite 读回后结构一致。
- [x] 验证：`/opt/homebrew/bin/volta run npm test -- tests/state/bridge-state-repository.test.ts tests/bridge/local-bridge-runtime.test.ts`。

## 阶段五：运行时切换到 SQLite

- [x] 在 `start-local-bridge` 中根据 `BRIDGE_USE_SQLITE` 或 `BRIDGE_DB_PATH` 选择 SQLite repository。
- [x] 未启用 SQLite 时继续使用 JSON repository，保证向后兼容。
- [x] 启用 SQLite 时，正常运行不再持续写入 `bridge-state.json`。
- [x] 覆盖前台任务、后台任务、消息去重、出站回环保护、附件记录的重启恢复测试。
- [x] 验证：`/opt/homebrew/bin/volta run npm test -- tests/bridge/start-local-bridge.test.ts tests/bridge/local-bridge-runtime.test.ts`。

## 阶段六：任务与日志增量写入优化

- [x] 新建 SQLite 任务管理实现，避免任务状态变化时重写整个状态快照。
- [x] 创建任务时插入 `jobs` 并追加初始 `job_logs`。
- [x] 更新任务状态时只更新对应 `jobs` 行并追加日志。
- [x] `/logs <jobId>` 从 `job_logs` 查询最近 10 条记录。
- [x] slow notice 记录 `slow_notice_sent_at`，确保同一任务不重复提醒。
- [x] 保留现有内存版 job manager 作为未启用 SQLite 时的 fallback。
- [x] 验证：`/opt/homebrew/bin/volta run npm test -- tests/bridge/sqlite-job-manager.test.ts tests/bridge/bridge-codex-executor.test.ts`。

## 阶段七：保留策略与清理机制

- [x] 新建任务保留策略模块。
- [x] 默认保留活跃任务，已结束任务保留 30 天。
- [x] 默认每个联系人最多保留 200 个已结束任务。
- [x] 支持 `BRIDGE_JOB_RETENTION_DAYS` 和 `BRIDGE_MAX_COMPLETED_JOBS` 配置。
- [x] 清理时不得删除 running、queued、cancelling 等活跃任务日志。
- [x] 补充清理策略测试，覆盖按天数和按数量清理。
- [x] 验证：`/opt/homebrew/bin/volta run npm test -- tests/state/retention.test.ts`。

## 阶段八：生产部署与文档

- [x] 更新 `scripts/run-production.sh`，生产环境启用 SQLite。
- [x] 更新 launchd plist，写入 `BRIDGE_USE_SQLITE` 和 `BRIDGE_DB_PATH`。
- [x] 更新 README，说明 SQLite 存储、迁移命令、回滚思路和 JSON 备份策略。
- [x] 更新 `docs/production.md`，补充停止服务、备份、迁移、启动、查看状态的完整步骤。
- [x] 记录迁移演练命令，避免直接操作唯一生产状态文件。
- [x] 验证：`plutil -lint deploy/launchd/com.akimixu.imessage-codex-bridge.plist`。
- [x] 验证：`bash -n scripts/run-production.sh scripts/install-launchd.sh scripts/uninstall-launchd.sh`。

## 阶段九：最终验收

- [x] 运行完整检查：`/opt/homebrew/bin/volta run npm run check`。
- [x] 运行生产自检：`/opt/homebrew/bin/volta run npm run doctor`。
- [x] 对当前 JSON 状态做本地迁移演练到 `.tmp/bridge-test.db`。
- [x] 核对 contacts、jobs、job_logs 数量与 JSON 来源一致。
- [x] 手动验证 `/jobs`、`/status <jobId>`、`/logs <jobId>`、`/cancel <jobId>` 在 SQLite 下可用。
- [x] 确认启用 SQLite 后 `data/bridge-state.json` 不再因正常运行持续增长。

## 建议提交切片

- [x] `build: 添加 SQLite 依赖`
- [x] `feat: 添加 SQLite 状态库`
- [x] `feat: 支持 JSON 状态迁移到 SQLite`
- [x] `refactor: 抽象 bridge 状态仓库`
- [x] `feat: 使用 SQLite 持久化任务日志`
- [x] `docs: 更新 SQLite 生产部署说明`

## 推荐第一批执行

- [x] 先完成阶段一到阶段三，拿到可验证的 SQLite 初始化与迁移工具。
- [x] 用 `.tmp/bridge-test.db` 演练迁移，确认不影响当前 launchd 生产服务。
- [x] 演练稳定后，再进入阶段四和阶段五切换运行时。
