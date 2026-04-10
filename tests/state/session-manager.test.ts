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

    expect(manager.getContact("+8613800000000")).toEqual({
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a",
      currentSessionId: null,
      sessions: []
    });
  });

  test("creates a default session and binds a Codex thread id back into state", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const manager = createSessionManager(state);

    expect(
      manager.bindThread({
        handle: "+8613800000000",
        sessionId: "session-1",
        threadId: "thread-1",
        activatedAt: 123456
      })
    ).toEqual({
      id: "session-1",
      name: "默认会话",
      workspace: "/tmp/workspace-a",
      threadId: "thread-1",
      createdAt: 123456,
      lastActiveAt: 123456
    });

    expect(state.contacts[0]?.currentSessionId).toBe("session-1");
    expect(state.contacts[0]?.sessions[0]?.threadId).toBe("thread-1");
  });

  test("touches the active session timestamp without replacing the thread", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    state.contacts[1]!.currentSessionId = "session-1";
    state.contacts[1]!.sessions = [
      {
        id: "session-1",
        name: "默认会话",
        workspace: "/tmp/workspace-b",
        threadId: "thread-2",
        createdAt: 900000,
        lastActiveAt: 900000
      }
    ];
    const manager = createSessionManager(state);

    expect(
      manager.touchSession({
        handle: "+8613900000000",
        sessionId: "session-1",
        activatedAt: 987654
      })
    ).toEqual({
      id: "session-1",
      name: "默认会话",
      workspace: "/tmp/workspace-b",
      threadId: "thread-2",
      createdAt: 900000,
      lastActiveAt: 987654
    });
  });

  test("fails fast for unknown contacts", () => {
    const manager = createSessionManager(createInitialBridgeState(TEST_CONFIG));

    expect(() => manager.getContact("+8613700000000")).toThrow(
      "未找到联系人会话映射: +8613700000000"
    );
  });

  test("creates, lists, and switches sessions", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const manager = createSessionManager(state);

    expect(
      manager.createSession({
        handle: "+8613800000000",
        name: "重构支付",
        createdAt: 1000
      })
    ).toEqual({
      handle: "+8613800000000",
      workspace: "/tmp/workspace-a",
      session: {
        id: "session-1",
        name: "重构支付",
        workspace: "/tmp/workspace-a",
        threadId: null,
        createdAt: 1000,
        lastActiveAt: 1000
      },
      index: 1
    });

    expect(
      manager.createSession({
        handle: "+8613800000000",
        createdAt: 2000
      })
    ).toEqual({
      handle: "+8613800000000",
      workspace: "/tmp/workspace-a",
      session: {
        id: "session-2",
        name: "新会话 2",
        workspace: "/tmp/workspace-a",
        threadId: null,
        createdAt: 2000,
        lastActiveAt: 2000
      },
      index: 2
    });

    expect(manager.listSessions("+8613800000000")).toHaveLength(2);
    expect(manager.switchSession("+8613800000000", 1).name).toBe("重构支付");
    expect(manager.getCurrentSession("+8613800000000")?.name).toBe("重构支付");
  });

  test("updates contact workspace and resets current session thread for next turn", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    state.contacts[0]!.workspace = "/tmp/workspace-a";
    state.contacts[0]!.currentSessionId = "session-2";
    state.contacts[0]!.sessions = [
      {
        id: "session-1",
        name: "默认会话",
        workspace: "/tmp/workspace-a",
        threadId: "thread-1",
        createdAt: 1000,
        lastActiveAt: 1000
      },
      {
        id: "session-2",
        name: "重构支付",
        workspace: "/tmp/workspace-a",
        threadId: "thread-2",
        createdAt: 2000,
        lastActiveAt: 2000
      }
    ];
    const manager = createSessionManager(state);

    expect(
      manager.updateWorkspace({
        handle: "+8613800000000",
        workspace: "/tmp/workspace-a2"
      })
    ).toEqual({
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a2",
      currentSessionId: "session-2",
      sessions: [
        {
          id: "session-1",
          name: "默认会话",
          workspace: "/tmp/workspace-a",
          threadId: "thread-1",
          createdAt: 1000,
          lastActiveAt: 1000
        },
        {
          id: "session-2",
          name: "重构支付",
          workspace: "/tmp/workspace-a2",
          threadId: null,
          createdAt: 2000,
          lastActiveAt: 2000
        }
      ]
    });
  });

  test("upserts and removes contact sessions in place", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const manager = createSessionManager(state);

    expect(
      manager.upsertContact({
        handle: "+8613700000000",
        name: "联系人 C",
        workspace: "/tmp/workspace-c"
      })
    ).toEqual({
      handle: "+8613700000000",
      name: "联系人 C",
      workspace: "/tmp/workspace-c",
      currentSessionId: null,
      sessions: []
    });

    expect(
      manager.upsertContact({
        handle: "+8613900000000",
        name: "联系人 B2",
        workspace: "/tmp/workspace-b2"
      })
    ).toEqual({
      handle: "+8613900000000",
      name: "联系人 B2",
      workspace: "/tmp/workspace-b2",
      currentSessionId: null,
      sessions: []
    });

    expect(manager.removeContact("+8613700000000")).toMatchObject({
      handle: "+8613700000000",
      name: "联系人 C"
    });
    expect(state.contacts.map((contact) => contact.handle)).toEqual([
      "+8613800000000",
      "+8613900000000"
    ]);
  });

  test("syncs all existing sessions when upserting an existing contact workspace", () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    state.contacts[1]!.currentSessionId = "session-2";
    state.contacts[1]!.sessions = [
      {
        id: "session-1",
        name: "默认会话",
        workspace: "/tmp/workspace-b",
        threadId: "thread-1",
        createdAt: 1000,
        lastActiveAt: 1000
      },
      {
        id: "session-2",
        name: "重构支付",
        workspace: "/tmp/workspace-b",
        threadId: "thread-2",
        createdAt: 2000,
        lastActiveAt: 2000
      }
    ];
    const manager = createSessionManager(state);

    expect(
      manager.upsertContact({
        handle: "+8613900000000",
        name: "联系人 B2",
        workspace: "/tmp/workspace-b2"
      })
    ).toEqual({
      handle: "+8613900000000",
      name: "联系人 B2",
      workspace: "/tmp/workspace-b2",
      currentSessionId: "session-2",
      sessions: [
        {
          id: "session-1",
          name: "默认会话",
          workspace: "/tmp/workspace-b2",
          threadId: null,
          createdAt: 1000,
          lastActiveAt: 1000
        },
        {
          id: "session-2",
          name: "重构支付",
          workspace: "/tmp/workspace-b2",
          threadId: null,
          createdAt: 2000,
          lastActiveAt: 2000
        }
      ]
    });
  });
});
