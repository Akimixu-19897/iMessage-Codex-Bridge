# 变更：local-imessage-bridge

## 目标

定义一个运行在本机 macOS 上的 iMessage 到 Codex 的桥接系统，实现持续会话、白名单控制和图片输入理解。

## 范围

- 范围内：本地消息收发、联系人白名单、联系人到 workspace 和线程的映射、图片输入理解、基础安全保护
- 范围外：云端托管、多用户体系、远程移动端控制台、完整富媒体工作流

## 制品状态

- [x] `proposal.md`
- [x] `design.md`
- [x] `tasks.md`

## 说明

- 本变更遵循默认制品依赖图：`proposal -> design -> tasks`
- 等能力边界稳定后，再补充更细的 `specs`
