import { describe, expect, test } from "vitest";

import { createAdminCommandExecutor } from "../../src/bridge/admin-command-executor.js";
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

describe("createAdminCommandExecutor", () => {
  test("adds contacts, lists contacts, updates workspace, and removes contacts", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const sessionManager = createSessionManager(state);
    const executor = createAdminCommandExecutor({
      sessionManager,
      saveState: async () => {}
    });

    await expect(
      executor.execute({
        type: "allow",
        handle: "+8613900000000",
        name: "联系人 B",
        workspace: "/tmp/workspace-b"
      })
    ).resolves.toBe(
      "已保存联系人：+8613900000000 | 联系人 B | /tmp/workspace-b"
    );

    await expect(
      executor.execute({
        type: "list"
      })
    ).resolves.toContain("+8613900000000 | 联系人 B | /tmp/workspace-b");

    await expect(
      executor.execute({
        type: "workspace",
        handle: "+8613900000000",
        workspace: "/tmp/new-workspace"
      })
    ).resolves.toBe(
      "已更新 workspace：+8613900000000 -> /tmp/new-workspace"
    );

    await expect(
      executor.execute({
        type: "remove",
        handle: "+8613900000000"
      })
    ).resolves.toBe("已移除联系人：+8613900000000");

    expect(state.contacts.map((contact) => contact.handle)).toEqual([
      "+8613800000000"
    ]);
  });
});
