import { describe, expect, test } from "vitest";

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
    },
    {
      handle: "+8613900000000",
      name: "联系人 B",
      workspace: "/tmp/workspace-b"
    }
  ]
};

describe("createSessionManager", () => {
  test("resolves a contact session with the configured workspace", () => {
    const manager = createSessionManager(createInitialBridgeState(TEST_CONFIG));

    expect(manager.getSession("+8613800000000")).toEqual({
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a",
      threadId: null,
      lastActiveAt: null
    });
  });

  test("binds a Codex thread id back into state", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const manager = createSessionManager(state);

    expect(
      manager.bindThread({
        handle: "+8613800000000",
        threadId: "thread-1",
        activatedAt: 123456
      })
    ).toEqual({
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a",
      threadId: "thread-1",
      lastActiveAt: 123456
    });

    expect(state.contacts[0]?.threadId).toBe("thread-1");
  });

  test("touches the last active timestamp without replacing the thread", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    state.contacts[1]!.threadId = "thread-2";
    const manager = createSessionManager(state);

    expect(
      manager.touchSession({
        handle: "+8613900000000",
        activatedAt: 987654
      })
    ).toEqual({
      handle: "+8613900000000",
      name: "联系人 B",
      workspace: "/tmp/workspace-b",
      threadId: "thread-2",
      lastActiveAt: 987654
    });
  });

  test("fails fast for unknown contacts", () => {
    const manager = createSessionManager(createInitialBridgeState(TEST_CONFIG));

    expect(() => manager.getSession("+8613700000000")).toThrow(
      "未找到联系人会话映射: +8613700000000"
    );
  });
});
