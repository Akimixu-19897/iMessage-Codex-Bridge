import { describe, expect, test, vi } from "vitest";

import { createBridgeOutboundDispatcher } from "../../src/bridge/bridge-outbound-dispatcher.js";

describe("createBridgeOutboundDispatcher", () => {
  test("dispatches both reject and reply actions through imsg send", async () => {
    const sendTextMessage = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: ""
    }));
    const dispatcher = createBridgeOutboundDispatcher({
      sendTextMessage
    });

    await expect(
      dispatcher.dispatch([
        {
          type: "reject",
          handle: "+8613900000000",
          message: "请联系管理员开通权限。"
        },
        {
          type: "reply",
          handle: "+8613800000000",
          message: "这是 Codex 的回复",
          threadId: "thread-1",
          turnId: "turn-1"
        }
      ])
    ).resolves.toEqual([
      {
        handle: "+8613900000000",
        message: "请联系管理员开通权限。",
        exitCode: 0
      },
      {
        handle: "+8613800000000",
        message: "这是 Codex 的回复",
        exitCode: 0
      }
    ]);

    expect(sendTextMessage).toHaveBeenNthCalledWith(1, {
      to: "+8613900000000",
      text: "请联系管理员开通权限。"
    });
    expect(sendTextMessage).toHaveBeenNthCalledWith(2, {
      to: "+8613800000000",
      text: "这是 Codex 的回复"
    });
  });
});
