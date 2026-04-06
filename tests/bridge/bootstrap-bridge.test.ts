import { describe, expect, test } from "vitest";

import { bootstrapBridge } from "../../src/bridge/bootstrap-bridge.js";

describe("bootstrapBridge", () => {
  test("returns blocked status when imsg is unavailable", async () => {
    const result = await bootstrapBridge({
      configPath: "/tmp/bridge.yaml",
      loadConfig: async () => ({
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "测试联系人",
            workspace: "/tmp/workspace-a"
          }
        ]
      }),
      detectImsgAvailability: async () => ({
        available: false,
        executablePath: null
      })
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "imsg_unavailable",
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
    });
  });

  test("returns ready status when config loads and imsg is available", async () => {
    const result = await bootstrapBridge({
      configPath: "/tmp/bridge.yaml",
      loadConfig: async () => ({
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "测试联系人",
            workspace: "/tmp/workspace-a"
          }
        ]
      }),
      detectImsgAvailability: async () => ({
        available: true,
        executablePath: "/usr/local/bin/imsg"
      })
    });

    expect(result).toEqual({
      status: "ready",
      executablePath: "/usr/local/bin/imsg",
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
    });
  });
});
