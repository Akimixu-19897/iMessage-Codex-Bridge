import { describe, expect, test, vi } from "vitest";

import { createTurnService } from "../../../src/adapters/codex/turn-service.js";

describe("createTurnService", () => {
  test("ensures the contact thread before starting a text turn", async () => {
    const ensureThread = vi.fn(async () => ({
      handle: "+8613800000000",
      sessionId: "session-1",
      workspace: "/tmp/workspace-a",
      threadId: "thread-1",
      created: false,
      thread: {
        id: "thread-1",
        cwd: "/tmp/workspace-a"
      }
    }));
    const startTurn = vi.fn(async () => ({
      id: "turn-1",
      status: "inProgress"
    }));
    const service = createTurnService({
      appServerClient: {
        startThread: vi.fn(),
        resumeThread: vi.fn(),
        startTurn,
        interruptTurn: vi.fn()
      },
      threadService: {
        ensureThread
      }
    });

    await expect(
      service.submitTextTurn({
        handle: "+8613800000000",
        text: "请帮我看一下这个项目"
      })
    ).resolves.toEqual({
      handle: "+8613800000000",
      sessionId: "session-1",
      threadId: "thread-1",
      workspace: "/tmp/workspace-a",
      turn: {
        id: "turn-1",
        status: "inProgress"
      }
    });

    expect(ensureThread).toHaveBeenCalledWith("+8613800000000");
    expect(startTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      cwd: "/tmp/workspace-a",
      input: [
        {
          type: "text",
          text: "请帮我看一下这个项目"
        }
      ]
    });
  });

  test("propagates thread resolution failures", async () => {
    const service = createTurnService({
      appServerClient: {
        startThread: vi.fn(),
        resumeThread: vi.fn(),
        startTurn: vi.fn(),
        interruptTurn: vi.fn()
      },
      threadService: {
        ensureThread: vi.fn(async () => {
          throw new Error("未找到联系人会话映射: +8613900000000");
        })
      }
    });

    await expect(
      service.submitTextTurn({
        handle: "+8613900000000",
        text: "你好"
      })
    ).rejects.toThrow("未找到联系人会话映射: +8613900000000");
  });

  test("includes local image items when attachments are provided", async () => {
    const startTurn = vi.fn(async () => ({
      id: "turn-2",
      status: "inProgress"
    }));
    const service = createTurnService({
      appServerClient: {
        startThread: vi.fn(),
        resumeThread: vi.fn(),
        startTurn,
        interruptTurn: vi.fn()
      },
      threadService: {
        ensureThread: vi.fn(async () => ({
          handle: "+8613800000000",
          sessionId: "session-1",
          workspace: "/tmp/workspace-a",
          threadId: "thread-1",
          created: false,
          thread: {
            id: "thread-1",
            cwd: "/tmp/workspace-a"
          }
        }))
      }
    });

    await service.submitTextTurn({
      handle: "+8613800000000",
      text: "看下图",
      imagePaths: ["/tmp/staged-image-a.png", "/tmp/staged-image-b.jpg"]
    });

    expect(startTurn).toHaveBeenCalledWith({
      threadId: "thread-1",
      cwd: "/tmp/workspace-a",
      input: [
        {
          type: "text",
          text: "看下图"
        },
        {
          type: "localImage",
          path: "/tmp/staged-image-a.png"
        },
        {
          type: "localImage",
          path: "/tmp/staged-image-b.jpg"
        }
      ]
    });
  });
});
