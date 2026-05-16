import { describe, expect, test, vi } from "vitest";

import { createBridgeCodexExecutor } from "../../src/bridge/bridge-codex-executor.js";
import { createJobManager } from "../../src/bridge/job-manager.js";
import { createInitialBridgeState } from "../../src/state/state-store.js";

const TEST_CONFIG = {
  rejectionMessage: "请联系管理员开通权限。",
  messageMergeWindowMs: 5000,
  contacts: [
    {
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a"
    }
  ]
};

function createTestJobManager() {
  const state = createInitialBridgeState(TEST_CONFIG);

  return createJobManager({
    state,
    saveState: async () => {}
  });
}

describe("createBridgeCodexExecutor", () => {
  test("passes reject actions through unchanged", async () => {
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn: vi.fn(),
      waitForTurn: vi.fn()
    });

    await expect(
      executor.execute(
        [
          {
            type: "reject",
            handle: "+8613900000000",
            message: "请联系管理员开通权限。"
          }
        ],
        1000
      )
    ).resolves.toEqual([
      {
        type: "reject",
        handle: "+8613900000000",
        message: "请联系管理员开通权限。"
      }
    ]);
  });

  test("acknowledges foreground work immediately and emits the final reply on poll", async () => {
    const submitTextTurn = vi.fn(async () => ({
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        status: "inProgress"
      }
    }));
    const waitForTurn = vi.fn(async () => ({
      text: "这是 Codex 的回复",
      status: "completed"
    }));
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn,
      waitForTurn
    });

    await expect(
      executor.execute(
        [
          {
            type: "submit",
            batch: {
              handle: "+8613800000000",
              messageIds: ["m1", "m2"],
              text: "第一句\n第二句",
              attachments: [],
              lastReceivedAt: 2000,
              background: false
            }
          }
        ],
        2000
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "已收到，Codex 正在处理…（任务 #job-1）",
        threadId: "job-submit",
        turnId: "job-submit"
      }
    ]);

    for (let index = 0; index < 20; index += 1) {
      if (submitTextTurn.mock.calls.length > 0) {
        break;
      }

      await Promise.resolve();
    }
    await Promise.resolve();

    await expect(executor.poll(2001)).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "任务 #job-1 已完成\n这是 Codex 的回复",
        threadId: "job",
        turnId: "job"
      }
    ]);

    expect(submitTextTurn).toHaveBeenCalledWith({
      handle: "+8613800000000",
      text: "第一句\n第二句",
      imagePaths: [],
      messageIds: ["m1", "m2"]
    });
    expect(waitForTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1",
      onDelta: expect.any(Function)
    });
  });

  test("turn failures are surfaced through job notifications", async () => {
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn: vi.fn(async () => {
        throw new Error("app-server unavailable");
      }),
      waitForTurn: vi.fn(),
      codexUnavailableMessage: "抱歉，Codex 暂时不可用，请稍后再试。"
    });

    await expect(
      executor.execute(
        [
          {
            type: "submit",
            batch: {
              handle: "+8613800000000",
              messageIds: ["m1"],
              text: "你好",
              attachments: [],
              lastReceivedAt: 2000,
              background: false
            }
          }
        ],
        2000
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "已收到，Codex 正在处理…（任务 #job-1）",
        threadId: "job-submit",
        turnId: "job-submit"
      }
    ]);

    await Promise.resolve();
    await Promise.resolve();

    await expect(executor.poll(2001)).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "任务 #job-1 执行失败：app-server unavailable",
        threadId: "job",
        turnId: "job"
      }
    ]);
  });

  test("passes merged attachment paths to background job submission", async () => {
    const submitTextTurn = vi.fn(async () => ({
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        status: "inProgress"
      }
    }));
    const waitForTurn = vi.fn(async () => ({
      text: "图片已收到",
      status: "completed"
    }));
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn,
      waitForTurn
    });

    await executor.execute(
      [
        {
          type: "submit",
          batch: {
            handle: "+8613800000000",
            messageIds: ["m-image"],
            text: "看看图片",
            attachments: ["/tmp/staged-image-a.png", "/tmp/staged-image-b.jpg"],
            lastReceivedAt: 2000,
            background: true
          }
        }
      ],
      2000
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(submitTextTurn).toHaveBeenCalledWith({
      handle: "+8613800000000",
      text: "看看图片",
      imagePaths: ["/tmp/staged-image-a.png", "/tmp/staged-image-b.jpg"],
      messageIds: ["m-image"]
    });
  });

  test("executes session commands without submitting a codex turn", async () => {
    const submitTextTurn = vi.fn();
    const waitForTurn = vi.fn();
    const executeSessionCommand = vi.fn(async () => "已切换到会话 #2：重构支付");
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn,
      waitForTurn,
      executeSessionCommand
    });

    await expect(
      executor.execute(
        [
          {
            type: "session_command",
            handle: "+8613800000000",
            command: {
              type: "switch",
              index: 2
            }
          }
        ],
        1000
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "已切换到会话 #2：重构支付",
        threadId: "session-command",
        turnId: "session-command"
      }
    ]);

    expect(executeSessionCommand).toHaveBeenCalledWith({
      handle: "+8613800000000",
      command: {
        type: "switch",
        index: 2
      }
    });
    expect(submitTextTurn).not.toHaveBeenCalled();
    expect(waitForTurn).not.toHaveBeenCalled();
  });

  test("background jobs do not block later actions in the same batch", async () => {
    const submitTextTurn = vi.fn(async () => ({
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        status: "inProgress"
      }
    }));
    const waitForTurn = vi.fn(
      () => new Promise<{ text: string; status: string }>(() => {})
    );
    const executeSessionCommand = vi.fn(async () => "已切换到会话 #2：重构支付");
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn,
      waitForTurn,
      executeSessionCommand
    });

    await expect(
      executor.execute(
        [
          {
            type: "submit",
            batch: {
              handle: "+8613800000000",
              messageIds: ["m1"],
              text: "请持续执行，直到完成",
              attachments: [],
              lastReceivedAt: 2000,
              background: true
            }
          },
          {
            type: "session_command",
            handle: "+8613800000000",
            command: {
              type: "switch",
              index: 2
            }
          }
        ],
        2000
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "已识别为长任务，任务 #job-1 已启动，可发送 /status job-1 查看状态。",
        threadId: "job-submit",
        turnId: "job-submit"
      },
      {
        type: "reply",
        handle: "+8613800000000",
        message: "已切换到会话 #2：重构支付",
        threadId: "session-command",
        turnId: "session-command"
      }
    ]);
  });

  test("starts autoresearch jobs and maps stage markers into notifications", async () => {
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn: vi.fn(async ({ text }) => {
        expect(text).toContain("$codex-autoresearch");
        expect(text).toContain("[[bridge-stage:阶段名]]");
        return {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "inProgress"
          }
        };
      }),
      waitForTurn: vi.fn(async ({ onDelta }) => {
        onDelta?.({
          delta: "[[bridge-stage:分析需求]]",
          text: "[[bridge-stage:分析需求]]"
        });
        onDelta?.({
          delta: "[[bridge-stage:运行验证]]",
          text: "[[bridge-stage:分析需求]][[bridge-stage:运行验证]]"
        });

        return {
          text: "[[bridge-stage:分析需求]][[bridge-stage:运行验证]]最终结论",
          status: "completed"
        };
      })
    });

    await expect(
      executor.execute(
        [
          {
            type: "job_command",
            handle: "+8613800000000",
            command: {
              type: "research",
              goal: "修复测试并总结原因"
            }
          }
        ],
        2000
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "研究任务 #job-1 已启动：研究：修复测试并总结原因",
        threadId: "job-command",
        turnId: "job-command"
      }
    ]);

    await Promise.resolve();
    await Promise.resolve();

    await expect(executor.poll(2001)).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "任务 #job-1 阶段更新：分析需求",
        threadId: "job",
        turnId: "job"
      },
      {
        type: "reply",
        handle: "+8613800000000",
        message: "任务 #job-1 阶段更新：运行验证",
        threadId: "job",
        turnId: "job"
      },
      {
        type: "reply",
        handle: "+8613800000000",
        message: "任务 #job-1 已完成\n最终结论",
        threadId: "job",
        turnId: "job"
      }
    ]);
  });

  test("times out stuck foreground turns and interrupts the running turn", async () => {
    const interruptTurn = vi.fn(async () => {});
    const cancelWaitForTurn = vi.fn();
    const executor = createBridgeCodexExecutor({
      jobManager: createTestJobManager(),
      submitTextTurn: vi.fn(async () => ({
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "inProgress"
        }
      })),
      waitForTurn: vi.fn(() => new Promise<{ text: string; status: string }>(() => {})),
      interruptTurn,
      cancelWaitForTurn,
      turnTimeoutMs: {
        foreground: 5
      }
    });

    await expect(
      executor.execute(
        [
          {
            type: "submit",
            batch: {
              handle: "+8613800000000",
              messageIds: ["m1"],
              text: "你好",
              attachments: [],
              lastReceivedAt: 2000,
              background: false
            }
          }
        ],
        2000
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "已收到，Codex 正在处理…（任务 #job-1）",
        threadId: "job-submit",
        turnId: "job-submit"
      }
    ]);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(interruptTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1"
    });
    expect(cancelWaitForTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1"
    });

    await expect(executor.poll(2021)).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "任务 #job-1 执行失败：任务执行超时，请稍后重试。",
        threadId: "job",
        turnId: "job"
      }
    ]);
  });

  test("cancels pending turn wait when cancelling a running job", async () => {
    const cancelWaitForTurn = vi.fn();
    const interruptTurn = vi.fn(async () => {});
    const jobManager = createTestJobManager();
    const executor = createBridgeCodexExecutor({
      jobManager,
      submitTextTurn: vi.fn(async () => ({
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "inProgress"
        }
      })),
      waitForTurn: vi.fn(() => new Promise<{ text: string; status: string }>(() => {})),
      cancelWaitForTurn,
      interruptTurn
    });

    await expect(
      executor.execute(
        [
          {
            type: "submit",
            batch: {
              handle: "+8613800000000",
              messageIds: ["m1"],
              text: "请持续执行",
              attachments: [],
              lastReceivedAt: 2000,
              background: true
            }
          }
        ],
        2000
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "已识别为长任务，任务 #job-1 已启动，可发送 /status job-1 查看状态。",
        threadId: "job-submit",
        turnId: "job-submit"
      }
    ]);

    for (let index = 0; index < 20; index += 1) {
      const job = jobManager.getJob("+8613800000000", "job-1");
      if (job.threadId && job.turnId) {
        break;
      }

      await Promise.resolve();
    }

    await expect(
      executor.execute(
        [
          {
            type: "job_command",
            handle: "+8613800000000",
            command: {
              type: "cancel",
              jobId: "job-1"
            }
          }
        ],
        2001
      )
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "任务 #job-1 已取消",
        threadId: "job-command",
        turnId: "job-command"
      }
    ]);

    expect(cancelWaitForTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1"
    });
    expect(interruptTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1"
    });
  });
});
