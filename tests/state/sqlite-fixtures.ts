import type { BridgeState } from "../../src/state/state-store.js";

export function createRepresentativeBridgeState(): BridgeState {
  return {
    version: 3,
    contacts: [
      {
        handle: "+8613800000000",
        name: "联系人 A",
        workspace: "/tmp/workspace-a",
        currentSessionId: "session-1",
        sessions: [
          {
            id: "session-1",
            name: "默认会话",
            workspace: "/tmp/workspace-a",
            threadId: "thread-1",
            lastActiveAt: 2_000,
            createdAt: 1_000
          }
        ]
      },
      {
        handle: "+8613900000000",
        name: "联系人 B",
        workspace: "/tmp/workspace-b",
        currentSessionId: null,
        sessions: []
      }
    ],
    processedMessages: [
      {
        messageId: "m1",
        handle: "+8613800000000",
        receivedAt: 3_000,
        processedAt: 4_000
      }
    ],
    outboundMessages: [
      {
        messageId: "out-1",
        handle: "+8613800000000",
        sentAt: 5_000
      }
    ],
    attachments: [
      {
        messageId: "m1",
        handle: "+8613800000000",
        threadId: "thread-1",
        sourcePath: "/tmp/input.png",
        stagedPath: "/tmp/staged/input.png",
        createdAt: 6_000
      }
    ],
    nextJobSequence: 3,
    jobs: [
      {
        id: "job-2",
        handle: "+8613800000000",
        sessionId: "session-1",
        mode: "background",
        workflow: "autoresearch",
        prompt: "继续优化",
        title: "SQLite 改造",
        sourceMessageIds: ["m1", "m2"],
        attachmentPaths: ["/tmp/staged/input.png"],
        status: "running",
        createdAt: 7_000,
        acknowledgedAt: 7_500,
        updatedAt: 8_000,
        startedAt: 7_200,
        finishedAt: null,
        currentStage: "正在执行",
        summary: null,
        errorMessage: null,
        threadId: "thread-1",
        turnId: "turn-1",
        lastHeartbeatAt: 7_900,
        nextHeartbeatAt: 9_000,
        slowNoticeSentAt: null,
        logs: [
          {
            at: 7_000,
            message: "任务已创建：SQLite 改造"
          },
          {
            at: 8_000,
            message: "正在执行"
          }
        ]
      },
      {
        id: "job-1",
        handle: "+8613900000000",
        sessionId: null,
        mode: "foreground",
        workflow: "generic",
        prompt: "你好",
        title: "你好",
        sourceMessageIds: ["m3"],
        attachmentPaths: [],
        status: "completed",
        createdAt: 1_000,
        acknowledgedAt: 1_100,
        updatedAt: 2_000,
        startedAt: 1_200,
        finishedAt: 2_000,
        currentStage: "已完成",
        summary: "完成",
        errorMessage: null,
        threadId: "thread-2",
        turnId: "turn-2",
        lastHeartbeatAt: null,
        nextHeartbeatAt: null,
        slowNoticeSentAt: 1_500,
        logs: [
          {
            at: 1_000,
            message: "任务已创建：你好"
          },
          {
            at: 2_000,
            message: "任务完成"
          }
        ]
      }
    ]
  };
}
