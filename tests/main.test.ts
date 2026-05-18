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
      databasePath: expect.stringContaining("data/bridge.db"),
      useSqlite: false,
      jobRetentionDays: undefined,
      maxCompletedJobs: undefined,
      attachmentDirectory: expect.stringContaining("data/attachments"),
      logLevel: "info"
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("bridge ready:");
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toEqual({
      executablePath: "/opt/homebrew/bin/imsg",
      contactCount: 1,
      statePath: expect.stringContaining("data/bridge-state.json"),
      databasePath: expect.stringContaining("data/bridge.db"),
      useSqlite: false,
      jobRetentionDays: undefined,
      maxCompletedJobs: undefined,
      attachmentDirectory: expect.stringContaining("data/attachments"),
      logLevel: "info",
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
      databasePath: expect.stringContaining("data/bridge.db"),
      useSqlite: false,
      jobRetentionDays: undefined,
      maxCompletedJobs: undefined,
      attachmentDirectory: expect.stringContaining("data/attachments"),
      logLevel: "info",
      watchArgs: ["watch", "--json", "--attachments"]
    });
  });

  test("uses environment path overrides for config, state, attachments, and log level", async () => {
    const log = vi.fn();
    const startBridge = vi.fn(async () => ({
      close: vi.fn(),
      watchArgs: ["watch", "--json", "--attachments"]
    }));
    const bootstrap = vi.fn(async () => ({
      status: "ready" as const,
      executablePath: "/opt/homebrew/bin/imsg",
      config: {
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "测试联系人 A",
            workspace: "/tmp/workspace-a"
          }
        ]
      }
    }));

    const exitCode = await runMain({
      bootstrap,
      startBridge,
      log,
      error: vi.fn(),
      env: {
        BRIDGE_CONFIG_PATH: "/tmp/custom-bridge.yaml",
        BRIDGE_STATE_PATH: "/tmp/custom-state.json",
        BRIDGE_DB_PATH: "/tmp/custom-bridge.db",
        BRIDGE_USE_SQLITE: "1",
        BRIDGE_JOB_RETENTION_DAYS: "7",
        BRIDGE_MAX_COMPLETED_JOBS: "50",
        BRIDGE_ATTACHMENT_DIR: "/tmp/custom-attachments",
        BRIDGE_LOG_LEVEL: "debug"
      }
    });

    expect(exitCode).toBe(0);
    expect(startBridge).toHaveBeenCalledWith({
      config: expect.any(Object),
      executablePath: "/opt/homebrew/bin/imsg",
      statePath: "/tmp/custom-state.json",
      databasePath: "/tmp/custom-bridge.db",
      useSqlite: true,
      jobRetentionDays: 7,
      maxCompletedJobs: 50,
      attachmentDirectory: "/tmp/custom-attachments",
      logLevel: "debug"
    });
    expect(JSON.parse(String(log.mock.calls[0]?.[1]))).toMatchObject({
      statePath: "/tmp/custom-state.json",
      databasePath: "/tmp/custom-bridge.db",
      useSqlite: true,
      jobRetentionDays: 7,
      maxCompletedJobs: 50,
      attachmentDirectory: "/tmp/custom-attachments",
      logLevel: "debug"
    });
  });
});
