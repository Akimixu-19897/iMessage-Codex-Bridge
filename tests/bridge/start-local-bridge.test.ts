import { describe, expect, test, vi } from "vitest";

import { startLocalBridge } from "../../src/bridge/start-local-bridge.js";

describe("startLocalBridge", () => {
  test("assembles state loading, app-server host, runtime, watch host, and loop runner", async () => {
    const config = {
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
    const state = {
      version: 3 as const,
      contacts: [],
      processedMessages: [],
      outboundMessages: [],
      attachments: [],
      nextJobSequence: 1,
      jobs: []
    };
    const appServerSession = {
      request: vi.fn(async () => ({})),
      close: vi.fn()
    };
    const loopSession = {
      close: vi.fn()
    };
    const app = {
      processImsgChunk: vi.fn(),
      drainActions: vi.fn(() => []),
      executeReadyActions: vi.fn(async () => []),
      dispatchReadyActions: vi.fn(async () => []),
      watchArgs: ["watch", "--json"]
    };
    const loadBridgeState = vi.fn(async () => state);
    const createAppServerHost = vi.fn(() => ({
      start: vi.fn(() => appServerSession)
    }));
    const createLocalRuntime = vi.fn(() => ({
      app,
      handleCodexNotification: vi.fn()
    }));
    const createImsgWatchHost = vi.fn(() => ({
      start: vi.fn(({ onChunk }: { onChunk: (chunk: string) => void }) => {
        onChunk('{"id":"m1"}\n');
        return loopSession;
      })
    }));
    const createBridgeLoopRunner = vi.fn(() => ({
      start: vi.fn(() => loopSession)
    }));
    const ensureWorkspaceDirectory = vi.fn(async () => {});

    const runtime = await startLocalBridge({
      config,
      executablePath: "/opt/homebrew/bin/imsg",
      statePath: "/tmp/bridge-state.json",
      attachmentDirectory: "/tmp/bridge-attachments",
      loadBridgeState,
      createAppServerHost,
      createLocalRuntime,
      createImsgWatchHost,
      createBridgeLoopRunner,
      ensureWorkspaceDirectory,
      sendTextMessage: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" }))
    });

    expect(loadBridgeState).toHaveBeenCalledWith({
      path: "/tmp/bridge-state.json",
      config
    });
    expect(createAppServerHost).toHaveBeenCalledTimes(1);
    expect(ensureWorkspaceDirectory).toHaveBeenCalledWith("/tmp/workspace-a");
    expect(createLocalRuntime).toHaveBeenCalledWith({
      config,
      state,
      statePath: "/tmp/bridge-state.json",
      attachmentDirectory: "/tmp/bridge-attachments",
      appServerSession,
      sendTextMessage: expect.any(Function)
    });
    expect(createImsgWatchHost).toHaveBeenCalledWith({
      executablePath: "/opt/homebrew/bin/imsg",
      watchArgs: ["watch", "--json"]
    });
    expect(createBridgeLoopRunner).toHaveBeenCalledWith({
      app,
      watchHost: expect.any(Object)
    });

    runtime.close();
    expect(loopSession.close).toHaveBeenCalledTimes(1);
    expect(appServerSession.close).toHaveBeenCalledTimes(1);
  });

  test("ensures workspace directories for both config and restored state contacts", async () => {
    const ensureWorkspaceDirectory = vi.fn(async () => {});

    await startLocalBridge({
      config: {
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "联系人 A",
            workspace: "/tmp/workspace-a"
          }
        ]
      },
      executablePath: "/opt/homebrew/bin/imsg",
      statePath: "/tmp/bridge-state.json",
      loadBridgeState: async () => ({
        version: 3,
        contacts: [
          {
            handle: "+8613800000000",
            name: "联系人 A",
            workspace: "/tmp/workspace-a",
            currentSessionId: null,
            sessions: []
          },
          {
            handle: "Qiushi.Xu@ks.casetekcorp.com",
            name: "lux-80531901",
            workspace: "/tmp/workspace-mail",
            currentSessionId: null,
            sessions: []
          }
        ],
        processedMessages: [],
        outboundMessages: [],
        attachments: [],
        nextJobSequence: 1,
        jobs: []
      }),
      createAppServerHost: vi.fn(() => ({
        start: vi.fn(() => ({
          request: vi.fn(async () => ({})),
          close: vi.fn()
        }))
      })),
      createLocalRuntime: vi.fn(() => ({
        app: {
          watchArgs: ["watch", "--json"],
          processImsgChunk: vi.fn(),
          drainActions: vi.fn(() => []),
          executeReadyActions: vi.fn(async () => []),
          dispatchReadyActions: vi.fn(async () => [])
        },
        handleCodexNotification: vi.fn()
      })),
      createImsgWatchHost: vi.fn(() => ({
        start: vi.fn(() => ({
          close: vi.fn()
        }))
      })),
      createBridgeLoopRunner: vi.fn(() => ({
        start: vi.fn(() => ({
          close: vi.fn()
        }))
      })),
      ensureWorkspaceDirectory,
      sendTextMessage: vi.fn(async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      }))
    });

    expect(ensureWorkspaceDirectory.mock.calls).toEqual([
      ["/tmp/workspace-a"],
      ["/tmp/workspace-mail"]
    ]);
  });

  test("forwards app-server notifications into the local runtime collector", async () => {
    const handleCodexNotification = vi.fn();
    const createLocalRuntime = vi.fn(() => ({
      app: {
        watchArgs: ["watch", "--json"],
        processImsgChunk: vi.fn(),
        drainActions: vi.fn(() => []),
        executeReadyActions: vi.fn(async () => []),
        dispatchReadyActions: vi.fn(async () => [])
      },
      handleCodexNotification
    }));
    let onNotification:
      | ((notification: { method: string; params?: unknown }) => void)
      | undefined;
    const startAppServerHost = vi.fn(() => ({
      request: vi.fn(async () => ({})),
      close: vi.fn()
    }));

    await startLocalBridge({
      config: {
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "联系人 A",
            workspace: "/tmp/workspace-a"
          }
        ]
      },
      executablePath: "/opt/homebrew/bin/imsg",
      statePath: "/tmp/bridge-state.json",
      loadBridgeState: async () => ({
        version: 3,
        contacts: [],
        processedMessages: [],
        outboundMessages: [],
        attachments: [],
        nextJobSequence: 1,
        jobs: []
      }),
      createAppServerHost: vi.fn((options) => {
        onNotification = options.onNotification;
        return {
          start: startAppServerHost
        };
      }),
      createLocalRuntime,
      createImsgWatchHost: vi.fn(() => ({
        start: vi.fn(() => ({
          close: vi.fn()
        }))
      })),
      createBridgeLoopRunner: vi.fn(() => ({
        start: vi.fn(() => ({
          close: vi.fn()
        }))
      })),
      sendTextMessage: vi.fn(async () => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      }))
    });

    onNotification?.({
      method: "turn/completed",
      params: {
        threadId: "thread-1"
      }
    });

    expect(handleCodexNotification).toHaveBeenCalledWith({
      method: "turn/completed",
      params: {
        threadId: "thread-1"
      }
    });
  });

  test("buffers app-server notifications that arrive before runtime initialization finishes", async () => {
    const seenNotifications: Array<{ method: string; params?: unknown }> = [];
    const createLocalRuntime = vi.fn(() => ({
      app: {
        watchArgs: ["watch", "--json"],
        processImsgChunk: vi.fn(),
        drainActions: vi.fn(() => []),
        executeReadyActions: vi.fn(async () => []),
        dispatchReadyActions: vi.fn(async () => [])
      },
      handleCodexNotification: vi.fn((notification) => {
        seenNotifications.push(notification);
      })
    }));

    await expect(
      startLocalBridge({
        config: {
          rejectionMessage: "请联系管理员开通权限。",
          messageMergeWindowMs: 5000,
          contacts: []
        },
        executablePath: "/opt/homebrew/bin/imsg",
        statePath: "/tmp/bridge-state.json",
        loadBridgeState: async () => ({
          version: 3,
          contacts: [],
          processedMessages: [],
          outboundMessages: [],
          attachments: [],
          nextJobSequence: 1,
          jobs: []
        }),
        createAppServerHost: vi.fn(({ onNotification }) => ({
          start: vi.fn(() => {
            onNotification({
              method: "turn/completed",
              params: {
                threadId: "thread-early",
                turn: {
                  id: "turn-early",
                  status: "completed"
                }
              }
            });

            return {
              request: vi.fn(async () => ({})),
              close: vi.fn()
            };
          })
        })),
        createLocalRuntime,
        createImsgWatchHost: vi.fn(() => ({
          start: vi.fn(() => ({
            close: vi.fn()
          }))
        })),
        createBridgeLoopRunner: vi.fn(() => ({
          start: vi.fn(() => ({
            close: vi.fn()
          }))
        })),
        sendTextMessage: vi.fn(async () => ({
          exitCode: 0,
          stdout: "",
          stderr: ""
        }))
      })
    ).resolves.toMatchObject({
      watchArgs: ["watch", "--json"]
    });

    expect(createLocalRuntime).toHaveBeenCalledTimes(1);
    expect(seenNotifications).toEqual([
      {
        method: "turn/completed",
        params: {
          threadId: "thread-early",
          turn: {
            id: "turn-early",
            status: "completed"
          }
        }
      }
    ]);
  });
});
