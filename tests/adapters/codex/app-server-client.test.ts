import { describe, expect, test, vi } from "vitest";

import { createCodexAppServerClient } from "../../../src/adapters/codex/app-server-client.js";

describe("createCodexAppServerClient", () => {
  test("sends a thread/start request with stable defaults", async () => {
    const invokeRequest = vi.fn(async () => ({
      thread: {
        id: "thread-1",
        cwd: "/tmp/workspace-a",
        updatedAt: 100
      }
    }));
    const client = createCodexAppServerClient({
      invokeRequest,
      nextRequestId: () => 11
    });

    await expect(
      client.startThread({
        cwd: "/tmp/workspace-a"
      })
    ).resolves.toEqual({
      id: "thread-1",
      cwd: "/tmp/workspace-a",
      updatedAt: 100
    });

    expect(invokeRequest).toHaveBeenCalledWith({
      id: 11,
      method: "thread/start",
      params: {
        cwd: "/tmp/workspace-a",
        experimentalRawEvents: false,
        persistExtendedHistory: true
      }
    });
  });

  test("sends a thread/resume request with the persisted thread id", async () => {
    const invokeRequest = vi.fn(async () => ({
      thread: {
        id: "thread-1",
        cwd: "/tmp/workspace-a",
        updatedAt: 200
      }
    }));
    const client = createCodexAppServerClient({
      invokeRequest,
      nextRequestId: () => 22
    });

    await expect(
      client.resumeThread({
        threadId: "thread-1",
        cwd: "/tmp/workspace-a"
      })
    ).resolves.toEqual({
      id: "thread-1",
      cwd: "/tmp/workspace-a",
      updatedAt: 200
    });

    expect(invokeRequest).toHaveBeenCalledWith({
      id: 22,
      method: "thread/resume",
      params: {
        threadId: "thread-1",
        cwd: "/tmp/workspace-a",
        persistExtendedHistory: true
      }
    });
  });

  test("allows explicit request flags to override defaults", async () => {
    const invokeRequest = vi.fn(async () => ({
      thread: {
        id: "thread-9",
        cwd: "/tmp/workspace-b"
      }
    }));
    const client = createCodexAppServerClient({
      invokeRequest,
      nextRequestId: () => 33
    });

    await client.startThread({
      cwd: "/tmp/workspace-b",
      experimentalRawEvents: true,
      persistExtendedHistory: false,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      developerInstructions: "仅允许操作 workspace"
    });

    expect(invokeRequest).toHaveBeenCalledWith({
      id: 33,
      method: "thread/start",
      params: {
        cwd: "/tmp/workspace-b",
        experimentalRawEvents: true,
        persistExtendedHistory: false,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        developerInstructions: "仅允许操作 workspace"
      }
    });
  });

  test("passes thread/resume policy overrides through to app-server", async () => {
    const invokeRequest = vi.fn(async () => ({
      thread: {
        id: "thread-9",
        cwd: "/tmp/workspace-b"
      }
    }));
    const client = createCodexAppServerClient({
      invokeRequest,
      nextRequestId: () => 34
    });

    await client.resumeThread({
      threadId: "thread-9",
      cwd: "/tmp/workspace-b",
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      developerInstructions: "管理员允许全部操作"
    });

    expect(invokeRequest).toHaveBeenCalledWith({
      id: 34,
      method: "thread/resume",
      params: {
        threadId: "thread-9",
        cwd: "/tmp/workspace-b",
        persistExtendedHistory: true,
        approvalPolicy: "never",
        sandbox: "danger-full-access",
        developerInstructions: "管理员允许全部操作"
      }
    });
  });

  test("sends a turn/start request with text input items", async () => {
    const invokeRequest = vi.fn(async () => ({
      turn: {
        id: "turn-1",
        status: "inProgress"
      }
    }));
    const client = createCodexAppServerClient({
      invokeRequest,
      nextRequestId: () => 44
    });

    await expect(
      client.startTurn({
        threadId: "thread-1",
        cwd: "/tmp/workspace-a",
        input: [
          {
            type: "text",
            text: "你好，Codex"
          }
        ]
      })
    ).resolves.toEqual({
      id: "turn-1",
      status: "inProgress"
    });

    expect(invokeRequest).toHaveBeenCalledWith({
      id: 44,
      method: "turn/start",
      params: {
        threadId: "thread-1",
        cwd: "/tmp/workspace-a",
        input: [
          {
            type: "text",
            text: "你好，Codex",
            text_elements: []
          }
        ]
      }
    });
  });

  test("sends localImage input items for staged image paths", async () => {
    const invokeRequest = vi.fn(async () => ({
      turn: {
        id: "turn-2",
        status: "inProgress"
      }
    }));
    const client = createCodexAppServerClient({
      invokeRequest,
      nextRequestId: () => 45
    });

    await client.startTurn({
      threadId: "thread-1",
      cwd: "/tmp/workspace-a",
      input: [
        {
          type: "text",
          text: "看下这张图"
        },
        {
          type: "localImage",
          path: "/tmp/staged-image.png"
        }
      ]
    });

    expect(invokeRequest).toHaveBeenCalledWith({
      id: 45,
      method: "turn/start",
      params: {
        threadId: "thread-1",
        cwd: "/tmp/workspace-a",
        input: [
          {
            type: "text",
            text: "看下这张图",
            text_elements: []
          },
          {
            type: "localImage",
            path: "/tmp/staged-image.png"
          }
        ]
      }
    });
  });
});
