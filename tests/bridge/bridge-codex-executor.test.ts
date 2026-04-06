import { describe, expect, test, vi } from "vitest";

import { createBridgeCodexExecutor } from "../../src/bridge/bridge-codex-executor.js";

describe("createBridgeCodexExecutor", () => {
  test("passes reject actions through unchanged", async () => {
    const executor = createBridgeCodexExecutor({
      submitTextTurn: vi.fn(),
      waitForTurn: vi.fn()
    });

    await expect(
      executor.execute([
        {
          type: "reject",
          handle: "+8613900000000",
          message: "请联系管理员开通权限。"
        }
      ])
    ).resolves.toEqual([
      {
        type: "reject",
        handle: "+8613900000000",
        message: "请联系管理员开通权限。"
      }
    ]);
  });

  test("submits merged text to codex and returns a reply action", async () => {
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
      submitTextTurn,
      waitForTurn
    });

    await expect(
      executor.execute([
        {
          type: "submit",
          batch: {
            handle: "+8613800000000",
            messageIds: ["m1", "m2"],
            text: "第一句\n第二句",
            attachments: [],
            lastReceivedAt: 2000
          }
        }
      ])
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "这是 Codex 的回复",
        threadId: "thread-1",
        turnId: "turn-1"
      }
    ]);

    expect(submitTextTurn).toHaveBeenCalledWith({
      handle: "+8613800000000",
      text: "第一句\n第二句"
    });
    expect(waitForTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1"
    });
  });
});
