import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { migrateBridgeStateToSqlite } from "../../src/state/migrate-json-to-sqlite.js";
import {
  initializeSqliteStore,
  readBridgeStateFromSqlite
} from "../../src/state/sqlite-store.js";
import { createRepresentativeBridgeState } from "./sqlite-fixtures.js";

describe("migrateBridgeStateToSqlite", () => {
  test("migrates representative JSON state into SQLite rows", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-migrate-"));
    const databasePath = join(tempDirectory, "bridge.db");
    const state = createRepresentativeBridgeState();

    migrateBridgeStateToSqlite({
      state,
      databasePath
    });

    const database = initializeSqliteStore(databasePath);
    try {
      expect(readBridgeStateFromSqlite(database)).toEqual(state);
      expect(
        (
          database
            .prepare("SELECT value FROM metadata WHERE key = ?")
            .get("next_job_sequence") as { value: string }
        ).value
      ).toBe("3");
    } finally {
      database.close();
    }
  });

  test("refuses to overwrite an existing database unless explicitly requested", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-migrate-"));
    const databasePath = join(tempDirectory, "bridge.db");
    const state = createRepresentativeBridgeState();

    migrateBridgeStateToSqlite({
      state,
      databasePath
    });

    expect(() =>
      migrateBridgeStateToSqlite({
        state,
        databasePath
      })
    ).toThrow("SQLite 数据库已有 bridge 状态");

    expect(() =>
      migrateBridgeStateToSqlite({
        state,
        databasePath,
        overwrite: true
      })
    ).not.toThrow();
  });
});
