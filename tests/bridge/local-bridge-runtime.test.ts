import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import { createLocalBridgeRuntime } from "../../src/bridge/local-bridge-runtime.js";
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

describe("createLocalBridgeRuntime", () => {
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
    const request = vi.fn(async (method: string, params?: unknown) => {
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
        message: "这是 Codex 的回复",
        exitCode: 0
      }
    ]);

    expect(request).toHaveBeenNthCalledWith(1, "thread/start", {
      cwd: "/tmp/workspace-a",
      experimentalRawEvents: false,
      persistExtendedHistory: true
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
      text: "这是 Codex 的回复"
    });
    expect(state.contacts[0]?.threadId).toBe("thread-1");
  });
});
