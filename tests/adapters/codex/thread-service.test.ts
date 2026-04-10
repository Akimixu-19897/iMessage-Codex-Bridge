import { describe, expect, test, vi } from "vitest";

import { createThreadService } from "../../../src/adapters/codex/thread-service.js";
import { createSessionManager } from "../../../src/state/session-manager.js";
import { createInitialBridgeState } from "../../../src/state/state-store.js";

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

describe("createThreadService", () => {
  test("starts a new thread for contacts without a persisted current session thread id", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const sessionManager = createSessionManager(state);
    const startThread = vi.fn(async () => ({
      id: "thread-1",
      cwd: "/tmp/workspace-a",
      updatedAt: 100
    }));
    const resumeThread = vi.fn();
    const saveState = vi.fn(async () => {});
    const service = createThreadService({
      appServerClient: {
        startThread,
        resumeThread,
        startTurn: vi.fn(),
        interruptTurn: vi.fn()
      },
      sessionManager,
      saveState,
      resolveThreadPolicy: () => ({
        approvalPolicy: "never",
        sandbox: "workspace-write",
        developerInstructions: "仅允许操作 workspace"
      }),
      now: () => 123456
    });

    await expect(service.ensureThread("+8613800000000")).resolves.toEqual({
      handle: "+8613800000000",
      sessionId: "session-1",
      workspace: "/tmp/workspace-a",
      threadId: "thread-1",
      created: true,
      thread: {
        id: "thread-1",
        cwd: "/tmp/workspace-a",
        updatedAt: 100
      }
    });

    expect(startThread).toHaveBeenCalledWith({
      cwd: "/tmp/workspace-a",
      experimentalRawEvents: false,
      persistExtendedHistory: true,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      developerInstructions: "仅允许操作 workspace"
    });
    expect(resumeThread).not.toHaveBeenCalled();
    expect(state.contacts[0]?.currentSessionId).toBe("session-1");
    expect(state.contacts[0]?.sessions[0]?.threadId).toBe("thread-1");
    expect(saveState).toHaveBeenCalledTimes(1);
  });

  test("resumes an existing thread for contacts with a persisted current session thread id", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    state.contacts[0]!.currentSessionId = "session-1";
    state.contacts[0]!.sessions = [
      {
        id: "session-1",
        name: "默认会话",
        workspace: "/tmp/workspace-a",
        threadId: "thread-1",
        createdAt: 100,
        lastActiveAt: 100
      }
    ];
    const sessionManager = createSessionManager(state);
    const startThread = vi.fn();
    const resumeThread = vi.fn(async () => ({
      id: "thread-1",
      cwd: "/tmp/workspace-a",
      updatedAt: 200
    }));
    const saveState = vi.fn(async () => {});
    const service = createThreadService({
      appServerClient: {
        startThread,
        resumeThread,
        startTurn: vi.fn(),
        interruptTurn: vi.fn()
      },
      sessionManager,
      saveState,
      resolveThreadPolicy: () => ({
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        developerInstructions: "管理员允许全部操作"
      }),
      now: () => 654321
    });

    await expect(service.ensureThread("+8613800000000")).resolves.toEqual({
      handle: "+8613800000000",
      sessionId: "session-1",
      workspace: "/tmp/workspace-a",
      threadId: "thread-1",
      created: false,
      thread: {
        id: "thread-1",
        cwd: "/tmp/workspace-a",
        updatedAt: 200
      }
    });

    expect(startThread).not.toHaveBeenCalled();
    expect(resumeThread).toHaveBeenCalledWith({
      threadId: "thread-1",
      cwd: "/tmp/workspace-a",
      persistExtendedHistory: true,
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      developerInstructions: "管理员允许全部操作"
    });
    expect(state.contacts[0]?.sessions[0]?.lastActiveAt).toBe(654321);
    expect(saveState).toHaveBeenCalledTimes(1);
  });

  test("propagates unknown contact failures from the session manager", async () => {
    const service = createThreadService({
      appServerClient: {
        startThread: vi.fn(),
        resumeThread: vi.fn(),
        startTurn: vi.fn(),
        interruptTurn: vi.fn()
      },
      sessionManager: createSessionManager(createInitialBridgeState(TEST_CONFIG))
    });

    await expect(service.ensureThread("+8613900000000")).rejects.toThrow(
      "未找到联系人会话映射: +8613900000000"
    );
  });
});
