import { describe, expect, test, vi } from "vitest";

import { runDoctor } from "../src/doctor.js";

describe("runDoctor", () => {
  test("reports dependency, config, state, attachment, and workspace checks", async () => {
    const result = await runDoctor({
      configPath: "/tmp/bridge.yaml",
      statePath: "/tmp/bridge-state.json",
      databasePath: "/tmp/bridge.db",
      attachmentDirectory: "/tmp/attachments",
      loadConfig: vi.fn(async () => ({
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "测试联系人",
            workspace: "/tmp/workspace-a"
          }
        ]
      })),
      detectImsgAvailability: vi.fn(async () => ({
        available: true,
        executablePath: "/opt/homebrew/bin/imsg"
      })),
      detectCodexAvailability: vi.fn(async () => true),
      ensureDirectory: vi.fn(async () => {})
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([
      {
        name: "config",
        ok: true,
        detail: "/tmp/bridge.yaml"
      },
      {
        name: "imsg",
        ok: true,
        detail: "/opt/homebrew/bin/imsg"
      },
      {
        name: "codex",
        ok: true,
        detail: "codex app-server 可用"
      },
      {
        name: "state",
        ok: true,
        detail: "/tmp/bridge-state.json"
      },
      {
        name: "database",
        ok: true,
        detail: "/tmp/bridge.db"
      },
      {
        name: "attachments",
        ok: true,
        detail: "/tmp/attachments"
      },
      {
        name: "workspace",
        ok: true,
        detail: "/tmp/workspace-a"
      }
    ]);
  });

  test("returns non-ok when a required dependency is unavailable", async () => {
    const result = await runDoctor({
      configPath: "/tmp/bridge.yaml",
      statePath: "/tmp/bridge-state.json",
      attachmentDirectory: "/tmp/attachments",
      loadConfig: vi.fn(async () => ({
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "测试联系人",
            workspace: "/tmp/workspace-a"
          }
        ]
      })),
      detectImsgAvailability: vi.fn(async () => ({
        available: false,
        executablePath: null
      })),
      detectCodexAvailability: vi.fn(async () => false),
      ensureDirectory: vi.fn(async () => {})
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: "imsg",
      ok: false,
      detail: "未找到 imsg"
    });
    expect(result.checks).toContainEqual({
      name: "codex",
      ok: false,
      detail: "codex app-server 不可用"
    });
  });
});
