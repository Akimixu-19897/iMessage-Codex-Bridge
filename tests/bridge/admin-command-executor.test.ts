import { describe, expect, test } from "vitest";

import { createAdminCommandExecutor } from "../../src/bridge/admin-command-executor.js";
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
    }
  ]
};

describe("createAdminCommandExecutor", () => {
  test("explains admin commands with purpose, parameters, and examples", async () => {
    const executor = createAdminCommandExecutor({
      sessionManager: createSessionManager(createInitialBridgeState(TEST_CONFIG)),
      saveState: async () => {}
    });

    await expect(
      executor.execute({
        type: "help"
      })
    ).resolves.toContain("查看当前白名单联系人、workspace 和会话数量");

    await expect(
      executor.execute({
        type: "help"
      })
    ).resolves.toContain(
      '/bridge allow "user@example.com" "张三" "/Users/akimixu/project-a"'
    );

    await expect(
      executor.execute({
        type: "help"
      })
    ).resolves.toContain("不传 workspace 时，会自动使用默认目录");
  });

  test("adds contacts, lists contacts, updates workspace, and removes contacts", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const sessionManager = createSessionManager(state);
    const executor = createAdminCommandExecutor({
      sessionManager,
      saveState: async () => {}
    });

    await expect(
      executor.execute({
        type: "allow",
        handle: "+8613900000000",
        name: "联系人 B",
        workspace: "/tmp/workspace-b"
      })
    ).resolves.toBe("已保存联系人：+8613900000000 | 联系人 B | /tmp/workspace-b");

    await expect(
      executor.execute({
        type: "list"
      })
    ).resolves.toContain("+8613900000000 | 联系人 B | /tmp/workspace-b");

    await expect(
      executor.execute({
        type: "workspace",
        handle: "+8613900000000",
        workspace: "/tmp/new-workspace"
      })
    ).resolves.toBe("已更新 workspace：+8613900000000 -> /tmp/new-workspace");

    await expect(
      executor.execute({
        type: "remove",
        handle: "+8613900000000"
      })
    ).resolves.toBe("已移除联系人：+8613900000000");

    expect(state.contacts.map((contact) => contact.handle)).toEqual(["+8613800000000"]);
  });

  test("creates a per-contact default workspace when allow omits workspace", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const sessionManager = createSessionManager(state);
    const ensuredPaths: string[] = [];
    const executor = createAdminCommandExecutor({
      sessionManager,
      saveState: async () => {},
      ensureWorkspaceDirectory: async (path) => {
        ensuredPaths.push(path);
      },
      resolveWorkspaceForHandle: (handle) =>
        `/Users/test/.imessage-codex-agent/workspace/${handle
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "_")
          .replace(/^_+|_+$/g, "")}`
    });

    await expect(
      executor.execute({
        type: "allow",
        handle: "Qiushi.Xu@ks.casetekcorp.com",
        name: "lux-80531901"
      })
    ).resolves.toBe(
      "已保存联系人：Qiushi.Xu@ks.casetekcorp.com | lux-80531901 | /Users/test/.imessage-codex-agent/workspace/qiushi.xu_ks.casetekcorp.com"
    );

    expect(ensuredPaths).toEqual([
      "/Users/test/.imessage-codex-agent/workspace/qiushi.xu_ks.casetekcorp.com"
    ]);
  });

  test("updates current session workspace and forces next message to start a new thread", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    state.contacts[0]!.currentSessionId = "session-1";
    state.contacts[0]!.sessions = [
      {
        id: "session-1",
        name: "默认会话",
        workspace: "/tmp/workspace-a",
        threadId: "thread-1",
        createdAt: 1000,
        lastActiveAt: 1000
      }
    ];
    const sessionManager = createSessionManager(state);
    const executor = createAdminCommandExecutor({
      sessionManager,
      saveState: async () => {}
    });

    await expect(
      executor.execute({
        type: "workspace",
        handle: "+8613800000000",
        workspace: "/tmp/workspace-a2"
      })
    ).resolves.toBe(
      "已更新 workspace：+8613800000000 -> /tmp/workspace-a2（当前会话将在新目录启动）"
    );

    expect(state.contacts[0]).toMatchObject({
      workspace: "/tmp/workspace-a2",
      currentSessionId: "session-1"
    });
    expect(state.contacts[0]?.sessions[0]).toMatchObject({
      workspace: "/tmp/workspace-a2",
      threadId: null
    });
  });

  test("ensures the target directory exists before applying an explicit workspace override", async () => {
    const state = createInitialBridgeState(TEST_CONFIG);
    const sessionManager = createSessionManager(state);
    const ensuredPaths: string[] = [];
    const executor = createAdminCommandExecutor({
      sessionManager,
      saveState: async () => {},
      ensureWorkspaceDirectory: async (path) => {
        ensuredPaths.push(path);
      }
    });

    await expect(
      executor.execute({
        type: "workspace",
        handle: "+8613800000000",
        workspace: "/tmp/new-explicit-workspace"
      })
    ).resolves.toBe("已更新 workspace：+8613800000000 -> /tmp/new-explicit-workspace");

    expect(ensuredPaths).toEqual(["/tmp/new-explicit-workspace"]);
  });

  test("supports /bridge workspace shortcut for the acting admin handle", async () => {
    const state = createInitialBridgeState({
      ...TEST_CONFIG,
      contacts: [
        {
          handle: "+8618352869601",
          name: "管理员",
          workspace: "/tmp/legacy-admin-workspace"
        }
      ]
    });
    state.contacts[0]!.currentSessionId = "session-1";
    state.contacts[0]!.sessions = [
      {
        id: "session-1",
        name: "默认会话",
        workspace: "/tmp/legacy-admin-workspace",
        threadId: "thread-1",
        createdAt: 1000,
        lastActiveAt: 1000
      }
    ];
    const sessionManager = createSessionManager(state);
    const ensuredPaths: string[] = [];
    const executor = createAdminCommandExecutor({
      sessionManager,
      saveState: async () => {},
      ensureWorkspaceDirectory: async (path) => {
        ensuredPaths.push(path);
      },
      resolveWorkspaceForHandle: (handle) =>
        `/Users/test/.imessage-codex-agent/workspace/${handle.replace(/[^0-9a-z._-]+/gi, "_").replace(/^_+|_+$/g, "")}`
    });

    await expect(
      executor.execute(
        {
          type: "workspace_default"
        },
        "+8618352869601"
      )
    ).resolves.toBe(
      "已更新 workspace：+8618352869601 -> /Users/test/.imessage-codex-agent/workspace/8618352869601（当前会话将在新目录启动）"
    );

    expect(ensuredPaths).toEqual([
      "/Users/test/.imessage-codex-agent/workspace/8618352869601"
    ]);
    expect(state.contacts[0]).toMatchObject({
      workspace: "/Users/test/.imessage-codex-agent/workspace/8618352869601"
    });
    expect(state.contacts[0]?.sessions[0]).toMatchObject({
      workspace: "/Users/test/.imessage-codex-agent/workspace/8618352869601",
      threadId: null
    });
  });
});
