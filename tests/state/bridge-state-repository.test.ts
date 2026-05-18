import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  createJsonBridgeStateRepository,
  createSqliteBridgeStateRepository
} from "../../src/state/bridge-state-repository.js";
import { createInitialBridgeState } from "../../src/state/state-store.js";
import { createRepresentativeBridgeState } from "./sqlite-fixtures.js";

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

describe("bridge-state-repository", () => {
  test("json and sqlite repositories round-trip equivalent snapshots", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-repository-"));
    const state = createRepresentativeBridgeState();
    const jsonRepository = createJsonBridgeStateRepository({
      path: join(tempDirectory, "bridge-state.json"),
      config: TEST_CONFIG
    });
    const sqliteRepository = createSqliteBridgeStateRepository({
      databasePath: join(tempDirectory, "bridge.db"),
      config: TEST_CONFIG
    });
    try {
      await jsonRepository.saveSnapshot(state);
      await sqliteRepository.saveSnapshot(state);

      await expect(jsonRepository.loadSnapshot()).resolves.toEqual(state);
      await expect(sqliteRepository.loadSnapshot()).resolves.toEqual(state);
    } finally {
      sqliteRepository.close?.();
    }
  });

  test("sqlite repository creates an initial state when the database is empty", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-repository-"));
    const repository = createSqliteBridgeStateRepository({
      databasePath: join(tempDirectory, "bridge.db"),
      config: TEST_CONFIG
    });
    try {
      await expect(repository.loadSnapshot()).resolves.toEqual(
        createInitialBridgeState(TEST_CONFIG)
      );
    } finally {
      repository.close?.();
    }
  });
});
