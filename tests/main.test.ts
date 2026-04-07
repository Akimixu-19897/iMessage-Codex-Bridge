import { describe, expect, test, vi } from "vitest";

import { runMain } from "../src/main.js";

describe("runMain", () => {
  test("returns exit code 1 and logs when bootstrap is blocked", async () => {
    const log = vi.fn();
    const error = vi.fn();

    const exitCode = await runMain({
      bootstrap: async () => ({
        status: "blocked",
        reason: "imsg_unavailable",
        config: {
          rejectionMessage: "请联系管理员开通权限。",
          messageMergeWindowMs: 5000,
          contacts: []
        }
      }),
      log,
      error
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith("bridge bootstrap blocked:", "imsg_unavailable");
    expect(log).not.toHaveBeenCalled();
  });

  test("returns exit code 0, starts the local bridge, and logs readiness when bootstrap succeeds", async () => {
    const log = vi.fn();
    const error = vi.fn();
    const startBridge = vi.fn(async () => ({
      close: vi.fn(),
      watchArgs: ["watch", "--json", "--attachments"]
    }));

    const exitCode = await runMain({
      bootstrap: async () => ({
        status: "ready",
        executablePath: "/opt/homebrew/bin/imsg",
        config: {
          rejectionMessage: "请联系管理员开通权限。",
          messageMergeWindowMs: 5000,
          contacts: [
            {
              handle: "+8613800000000",
              name: "测试联系人",
              workspace: "/tmp/workspace-a"
            }
          ]
        }
      }),
      startBridge,
      log,
      error
    });

    expect(exitCode).toBe(0);
    expect(startBridge).toHaveBeenCalledWith({
      config: {
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "测试联系人",
            workspace: "/tmp/workspace-a"
          }
        ]
      },
      executablePath: "/opt/homebrew/bin/imsg",
      statePath: expect.stringContaining("data/bridge-state.json"),
      attachmentDirectory: expect.stringContaining("data/attachments")
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("bridge ready:");
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toEqual({
      executablePath: "/opt/homebrew/bin/imsg",
      contactCount: 1,
      statePath: expect.stringContaining("data/bridge-state.json"),
      attachmentDirectory: expect.stringContaining("data/attachments"),
      watchArgs: ["watch", "--json", "--attachments"]
    });
    expect(error).not.toHaveBeenCalled();
  });

  test("uses the provided started bridge metadata when logging readiness", async () => {
    const log = vi.fn();
    const startBridge = vi.fn(async () => ({
      close: vi.fn(),
      watchArgs: ["watch", "--json", "--attachments"]
    }));

    const exitCode = await runMain({
      bootstrap: async () => ({
        status: "ready",
        executablePath: "/opt/homebrew/bin/imsg",
        config: {
          rejectionMessage: "请联系管理员开通权限。",
          messageMergeWindowMs: 5000,
          contacts: [
            {
              handle: "+8613800000000",
              name: "测试联系人 A",
              workspace: "/tmp/workspace-a"
            },
            {
              handle: "+8613900000000",
              name: "测试联系人 B",
              workspace: "/tmp/workspace-b"
            }
          ]
        }
      }),
      startBridge,
      log,
      error: vi.fn()
    });

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("bridge ready:");
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toEqual({
      executablePath: "/opt/homebrew/bin/imsg",
      contactCount: 2,
      statePath: expect.stringContaining("data/bridge-state.json"),
      attachmentDirectory: expect.stringContaining("data/attachments"),
      watchArgs: ["watch", "--json", "--attachments"]
    });
  });
});
