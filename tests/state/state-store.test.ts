import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createInitialBridgeState,
  loadBridgeState,
  saveBridgeState
} from "../../src/state/state-store.js";

const TEST_CONFIG = {
  rejectionMessage: "请联系管理员开通权限。",
  messageMergeWindowMs: 5000,
  contacts: [
    {
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a"
    },
    {
      handle: "+8613900000000",
      name: "联系人 B",
      workspace: "/tmp/workspace-b"
    }
  ]
};

describe("state-store", () => {
  test("creates the initial state from config contacts", () => {
    expect(createInitialBridgeState(TEST_CONFIG)).toEqual({
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
          handle: "+8613900000000",
          name: "联系人 B",
          workspace: "/tmp/workspace-b",
          currentSessionId: null,
          sessions: []
        }
      ],
      processedMessages: [],
      outboundMessages: [],
      attachments: [],
      nextJobSequence: 1,
      jobs: []
    });
  });

  test("returns the initial state when the state file does not exist", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-state-"));

    await expect(
      loadBridgeState({
        path: join(tempDirectory, "missing.json"),
        config: TEST_CONFIG
      })
    ).resolves.toEqual(createInitialBridgeState(TEST_CONFIG));
  });

  test("persists and reloads bridge state as JSON", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const statePath = join(tempDirectory, "state", "bridge-state.json");
    const state = {
      version: 3 as const,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a",
          currentSessionId: "session-1",
          sessions: [
            {
              id: "session-1",
              name: "默认会话",
              workspace: "/tmp/workspace-a",
              threadId: "thread-1",
              lastActiveAt: 123456,
              createdAt: 120000
            }
          ]
        }
      ],
      processedMessages: [
        {
          messageId: "m1",
          handle: "+8613800000000",
          receivedAt: 1000,
          processedAt: 2000
        }
      ],
      outboundMessages: [
        {
          messageId: "out-1",
          handle: "+8613800000000",
          sentAt: 3000
        }
      ],
      attachments: [
        {
          messageId: "m1",
          handle: "+8613800000000",
          threadId: "thread-1",
          sourcePath: "/tmp/input.png",
          stagedPath: "/tmp/staged/input.png",
          createdAt: 4000
        }
      ],
      nextJobSequence: 2,
      jobs: []
    };

    await saveBridgeState({
      path: statePath,
      state
    });

    await expect(
      loadBridgeState({
        path: statePath,
        config: TEST_CONFIG
      })
    ).resolves.toEqual(state);

    await expect(readFile(statePath, "utf8")).resolves.toContain('"currentSessionId": "session-1"');
  });

  test("migrates legacy version 1 state into version 3 sessions", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const statePath = join(tempDirectory, "bridge-state.json");

    await writeFile(
      statePath,
      JSON.stringify({
        version: 1,
        contacts: [
          {
            handle: "+8613800000000",
            name: "联系人 A",
            workspace: "/tmp/workspace-a",
            threadId: "thread-1",
            lastActiveAt: 123456
          }
        ],
        processedMessages: [],
        outboundMessages: [],
        attachments: []
      }),
      "utf8"
    );

    await expect(
      loadBridgeState({
        path: statePath,
        config: TEST_CONFIG
      })
    ).resolves.toEqual({
      version: 3,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a",
          currentSessionId: "session-1",
          sessions: [
            {
              id: "session-1",
              name: "默认会话",
              workspace: "/tmp/workspace-a",
              threadId: "thread-1",
              lastActiveAt: 123456,
              createdAt: 123456
            }
          ]
        }
      ],
      processedMessages: [],
      outboundMessages: [],
      attachments: [],
      nextJobSequence: 1,
      jobs: []
    });
  });

  test("fails fast when the state file is corrupted", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-state-"));
    const statePath = join(tempDirectory, "bridge-state.json");

    await writeFile(statePath, '{"version":1,"contacts":"bad"}', "utf8");

    await expect(
      loadBridgeState({
        path: statePath,
        config: TEST_CONFIG
      })
    ).rejects.toThrow(`状态文件无效，请人工修复后重试: ${statePath}`);
  });
});
