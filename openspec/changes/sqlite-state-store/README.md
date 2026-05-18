# 变更：sqlite-state-store

## 目标

用 SQLite 替换当前单文件 `data/bridge-state.json` 运行态存储，保留现有 iMessage bridge 行为，同时提升状态持久化可靠性，避免任务日志和历史记录持续撑大 JSON 文件。

## 范围

- 范围内：SQLite schema、数据库初始化、JSON 到 SQLite 迁移、运行时存储抽象、任务与日志增量写入、生产部署文档与迁移步骤。
- 范围内：保留迁移期 JSON 备份能力，确保现有联系人、会话、任务、日志、附件、消息去重和已发送记录可完整迁移。
- 范围外：云端数据库、多机器同步、远程控制台、多用户权限体系、跨设备高可用集群。

## 制品状态

- [x] `proposal.md`
- [x] `design.md`
- [x] `tasks.md`

## 说明

- 本变更基于 [SQLite 状态存储改造实施计划](../../../docs/plans/2026-05-18-sqlite-state-store.md)。
- 本变更遵循项目 OpenSpec 配置：`proposal -> design -> tasks`。
- 每个任务都必须具备独立验证命令或明确验收条件。
