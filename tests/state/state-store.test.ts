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
      version: 1,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a",
          threadId: null,
          lastActiveAt: null
        },
        {
          handle: "+8613900000000",
          name: "联系人 B",
          workspace: "/tmp/workspace-b",
          threadId: null,
          lastActiveAt: null
        }
      ],
      processedMessages: [],
      outboundMessages: [],
      attachments: []
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
      version: 1 as const,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a",
          threadId: "thread-1",
          lastActiveAt: 123456
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
      ]
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

    await expect(readFile(statePath, "utf8")).resolves.toContain('"threadId": "thread-1"');
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
