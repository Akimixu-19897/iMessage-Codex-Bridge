import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createLocalBridgeRuntime } from "../../src/bridge/local-bridge-runtime.js";
import { createInitialBridgeState } from "../../src/state/state-store.js";

async function flushBackgroundJob(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (predicate()) {
      return;
    }

    await flushBackgroundJob();
  }

  throw new Error("condition not met in time");
}

const TEST_CONFIG = {
  rejectionMessage: "请联系管理员开通权限。",
  messageMergeWindowMs: 5000,
  adminHandles: ["+8613800000000"],
  contacts: [
    {
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a"
    }
  ]
};

describe("createLocalBridgeRuntime", () => {
  test("executes admin commands and immediately replies with state changes", async () => {
    const state = createInitialBridgeState({
      ...TEST_CONFIG,
      adminHandles: ["+8613700000000"]
    });
    const stateDirectory = await mkdtemp(join(tmpdir(), "bridge-runtime-"));
    const sendTextMessage = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: ""
    }));
    const request = vi.fn(async (method: string) => {
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-2",
            cwd: "/tmp/workspace-b"
          }
        };
      }

      if (method === "turn/start") {
        queueMicrotask(() => {
          runtime.handleCodexNotification({
            method: "item/agentMessage/delta",
            params: {
              threadId: "thread-2",
              turnId: "turn-2",
              itemId: "item-2",
              delta: "新联系人已接入"
            }
          });
          runtime.handleCodexNotification({
            method: "turn/completed",
            params: {
              threadId: "thread-2",
              turn: {
                id: "turn-2",
                status: "completed"
              }
            }
          });
        });

        return {
          turn: {
            id: "turn-2",
            status: "inProgress"
          }
        };
      }

      throw new Error(`unexpected method: ${method}`);
    });
    const runtime = createLocalBridgeRuntime({
      config: {
        ...TEST_CONFIG,
        adminHandles: ["+8613700000000"]
      },
      state,
      statePath: join(stateDirectory, "bridge-state.json"),
      appServerSession: {
        request
      },
      sendTextMessage
    });

    runtime.app.processImsgChunk(
      '{"id":"admin-1","chatId":"chat-1","sender":{"handle":"+8613700000000"},"text":"/bridge allow +8613900000000 联系人B","timestamp":1000,"attachments":[]}\n'
    );

    await expect(runtime.app.dispatchReadyActions(1000)).resolves.toEqual([
      {
        handle: "+8613700000000",
        message: expect.stringContaining("已保存联系人：+8613900000000 | 联系人B | "),
        exitCode: 0
      }
    ]);

    runtime.app.processImsgChunk(
      '{"id":"m1","chatId":"chat-2","sender":{"handle":"+8613900000000"},"text":"你好","timestamp":2000,"attachments":[]}\n'
    );

    await expect(runtime.app.dispatchReadyActions(8000)).resolves.toEqual([
      {
        handle: "+8613900000000",
        message: "已收到，Codex 正在处理…（任务 #job-1）",
        exitCode: 0
      }
    ]);

    await waitFor(() => state.jobs[0]?.status === "completed");

    await expect(runtime.app.dispatchReadyActions(8001)).resolves.toEqual([
      {
        handle: "+8613900000000",
        message: "任务 #job-1 已完成\n新联系人已接入",
        exitCode: 0
      }
    ]);

    expect(state.contacts.map((contact) => contact.handle)).toEqual([
      "+8613800000000",
      "+8613900000000"
    ]);
    expect(state.contacts[1]?.workspace).toContain(
      "/.imessage-codex-agent/workspace/8613900000000"
    );
    expect(request).toHaveBeenNthCalledWith(1, "thread/start", {
      cwd: expect.stringContaining("/.imessage-codex-agent/workspace/8613900000000"),
      experimentalRawEvents: false,
      persistExtendedHistory: true,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      developerInstructions: expect.stringContaining("只允许在自己的 workspace 目录内")
    });
  });

  test("assembles bridge -> codex -> outbound delivery into one runtime", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const stateDirectory = await mkdtemp(join(tmpdir(), "bridge-runtime-"));
    const sourceImagePath = join(stateDirectory, "input-image.png");
    await writeFile(sourceImagePath, "image-bytes", "utf8");
    const sendTextMessage = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: ""
    }));
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-1",
            cwd: "/tmp/workspace-a"
          }
        };
      }

      if (method === "turn/start") {
        queueMicrotask(() => {
          runtime.handleCodexNotification({
            method: "item/agentMessage/delta",
            params: {
              threadId: "thread-1",
              turnId: "turn-1",
              itemId: "item-1",
              delta: "这是 Codex 的回复"
            }
          });
          runtime.handleCodexNotification({
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: {
                id: "turn-1",
                status: "completed"
              }
            }
          });
        });

        return {
          turn: {
            id: "turn-1",
            status: "inProgress"
          }
        };
      }

      throw new Error(`unexpected method: ${method}`);
    });
    const runtime = createLocalBridgeRuntime({
      config: TEST_CONFIG,
      state,
      statePath: join(stateDirectory, "bridge-state.json"),
      appServerSession: {
        request
      },
      sendTextMessage
    });

    runtime.app.processImsgChunk(
      `{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000"},"text":"你好","timestamp":1000,"attachments":[{"path":"${sourceImagePath}"}]}\n`
    );

    await expect(runtime.app.dispatchReadyActions(7000)).resolves.toEqual([
      {
        handle: "+8613800000000",
        message: "已收到，Codex 正在处理…（任务 #job-1）",
        exitCode: 0
      }
    ]);

    await waitFor(() => state.jobs[0]?.status === "completed");

    await expect(runtime.app.dispatchReadyActions(7001)).resolves.toEqual([
      {
        handle: "+8613800000000",
        message: "任务 #job-1 已完成\n这是 Codex 的回复",
        exitCode: 0
      }
    ]);

    expect(request).toHaveBeenNthCalledWith(1, "thread/start", {
      cwd: "/tmp/workspace-a",
      experimentalRawEvents: false,
      persistExtendedHistory: true,
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      developerInstructions: expect.stringContaining("当前联系人是管理员")
    });
    expect(request).toHaveBeenNthCalledWith(2, "turn/start", {
      threadId: "thread-1",
      cwd: "/tmp/workspace-a",
      input: [
        {
          type: "text",
          text: "你好",
          text_elements: []
        },
        {
          type: "localImage",
          path: expect.stringContaining("input-image.png")
        }
      ]
    });
    expect(state.attachments).toHaveLength(1);
    expect(state.attachments[0]).toMatchObject({
      handle: "+8613800000000",
      messageId: "m1",
      threadId: "thread-1",
      sourcePath: sourceImagePath
    });
    await expect(readFile(state.attachments[0]!.stagedPath, "utf8")).resolves.toBe(
      "image-bytes"
    );
    expect(sendTextMessage).toHaveBeenCalledWith({
      to: "+8613800000000",
      text: "任务 #job-1 已完成\n这是 Codex 的回复"
    });
    expect(state.contacts[0]?.sessions[0]?.threadId).toBe("thread-1");
  });

  test("logs attachment staging failures and falls back to text-only turns", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const stateDirectory = await mkdtemp(join(tmpdir(), "bridge-runtime-"));
    const logError = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === "thread/start") {
        return {
          thread: {
            id: "thread-1",
            cwd: "/tmp/workspace-a"
          }
        };
      }

      if (method === "turn/start") {
        queueMicrotask(() => {
          runtime.handleCodexNotification({
            method: "turn/completed",
            params: {
              threadId: "thread-1",
              turn: {
                id: "turn-1",
                status: "completed"
              }
            }
          });
        });

        return {
          turn: {
            id: "turn-1",
            status: "inProgress"
          }
        };
      }

      throw new Error(`unexpected method: ${method}`);
    });
    const runtime = createLocalBridgeRuntime({
      config: TEST_CONFIG,
      state,
      statePath: join(stateDirectory, "bridge-state.json"),
      appServerSession: {
        request
      },
      sendTextMessage: vi.fn(async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })),
      logError
    });

    runtime.app.processImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000"},"text":"你好","timestamp":1000,"attachments":[{"path":"/tmp/missing-image.png"}]}\n'
    );

    await expect(runtime.app.dispatchReadyActions(7000)).resolves.toEqual([
      {
        handle: "+8613800000000",
        message: "已收到，Codex 正在处理…（任务 #job-1）",
        exitCode: 0
      }
    ]);

    await waitFor(() => request.mock.calls.length >= 2);
    await runtime.app.dispatchReadyActions(7001);

    expect(request).toHaveBeenNthCalledWith(2, "turn/start", {
      threadId: "thread-1",
      cwd: "/tmp/workspace-a",
      input: [
        {
          type: "text",
          text: "你好",
          text_elements: []
        }
      ]
    });
    expect(logError).toHaveBeenCalledWith(
      "bridge attachment staging failed, falling back to text-only turn:",
      expect.any(Error)
    );
    expect(state.attachments).toEqual([]);
  });
});
