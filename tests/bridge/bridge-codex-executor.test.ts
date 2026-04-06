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
      text: "第一句\n第二句",
      imagePaths: [],
      messageIds: ["m1", "m2"]
    });
    expect(waitForTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      turnId: "turn-1"
    });
  });

  test("returns a user-readable fallback reply when codex execution fails", async () => {
    const executor = createBridgeCodexExecutor({
      submitTextTurn: vi.fn(async () => {
        throw new Error("app-server unavailable");
      }),
      waitForTurn: vi.fn(),
      codexUnavailableMessage: "抱歉，Codex 暂时不可用，请稍后再试。"
    });

    await expect(
      executor.execute([
        {
          type: "submit",
          batch: {
            handle: "+8613800000000",
            messageIds: ["m1"],
            text: "你好",
            attachments: [],
            lastReceivedAt: 2000
          }
        }
      ])
    ).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "抱歉，Codex 暂时不可用，请稍后再试。",
        threadId: "unavailable",
        turnId: "unavailable"
      }
    ]);
  });

  test("passes merged attachment paths to the codex turn submission", async () => {
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
      submitTextTurn,
      waitForTurn
    });

    await executor.execute([
      {
        type: "submit",
        batch: {
          handle: "+8613800000000",
          messageIds: ["m-image"],
          text: "看看图片",
          attachments: ["/tmp/staged-image-a.png", "/tmp/staged-image-b.jpg"],
          lastReceivedAt: 2000
        }
      }
    ]);

    expect(submitTextTurn).toHaveBeenCalledWith({
      handle: "+8613800000000",
      text: "看看图片",
      imagePaths: ["/tmp/staged-image-a.png", "/tmp/staged-image-b.jpg"],
      messageIds: ["m-image"]
    });
  });
});
