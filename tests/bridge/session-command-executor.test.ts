import { describe, expect, test } from "vitest";

import { createSessionCommandExecutor } from "../../src/bridge/session-command-executor.js";
import { createSessionManager } from "../../src/state/session-manager.js";
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

describe("createSessionCommandExecutor", () => {
  test("creates, lists, reads, and switches sessions for one contact", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const sessionManager = createSessionManager(state);
    const executor = createSessionCommandExecutor({
      sessionManager,
      saveState: async () => {}
    });

    await expect(
      executor.execute({
        handle: "+8613800000000",
        command: {
          type: "new",
          name: "重构支付"
        }
      })
    ).resolves.toContain("已创建并切换到会话 #1：重构支付");

    await expect(
      executor.execute({
        handle: "+8613800000000",
        command: {
          type: "new"
        }
      })
    ).resolves.toContain("已创建并切换到会话 #2：新会话 2");

    await expect(
      executor.execute({
        handle: "+8613800000000",
        command: {
          type: "list"
        }
      })
    ).resolves.toContain("#2 * 新会话 2");

    await expect(
      executor.execute({
        handle: "+8613800000000",
        command: {
          type: "current"
        }
      })
    ).resolves.toContain("当前会话：#2 新会话 2");

    await expect(
      executor.execute({
        handle: "+8613800000000",
        command: {
          type: "switch",
          index: 1
        }
      })
    ).resolves.toBe("已切换到会话 #1：重构支付");
  });
});
