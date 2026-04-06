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

  test("returns exit code 0 and logs readiness when bootstrap succeeds", async () => {
    const log = vi.fn();
    const error = vi.fn();
    const createApp = vi.fn((config) => ({
      watchArgs: ["watch", "--json", "--participants", config.contacts[0].handle]
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
      createApp,
      log,
      error
    });

    expect(exitCode).toBe(0);
    expect(createApp).toHaveBeenCalledWith({
      rejectionMessage: "请联系管理员开通权限。",
      messageMergeWindowMs: 5000,
      contacts: [
        {
          handle: "+8613800000000",
          name: "测试联系人",
          workspace: "/tmp/workspace-a"
        }
      ]
    });
    expect(log).toHaveBeenCalledWith(
      "bridge ready:",
      JSON.stringify(
        {
          executablePath: "/opt/homebrew/bin/imsg",
          contactCount: 1,
          watchArgs: ["watch", "--json", "--participants", "+8613800000000"]
        },
        null,
        2
      )
    );
    expect(error).not.toHaveBeenCalled();
  });

  test("uses the default bridge app factory to expose real watch arguments", async () => {
    const log = vi.fn();

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
      log,
      error: vi.fn()
    });

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "bridge ready:",
      JSON.stringify(
        {
          executablePath: "/opt/homebrew/bin/imsg",
          contactCount: 2,
          watchArgs: [
            "watch",
            "--json",
            "--attachments",
            "--participants",
            "+8613800000000,+8613900000000"
          ]
        },
        null,
        2
      )
    );
  });
});
