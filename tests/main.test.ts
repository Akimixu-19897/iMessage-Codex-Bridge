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
      log,
      error
    });

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "bridge ready:",
      JSON.stringify(
        {
          executablePath: "/opt/homebrew/bin/imsg",
          contactCount: 1
        },
        null,
        2
      )
    );
    expect(error).not.toHaveBeenCalled();
  });
});
