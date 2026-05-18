import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  initializeSqliteStore,
  readBridgeStateFromSqlite,
  writeBridgeStateToSqlite
} from "../../src/state/sqlite-store.js";
import { createRepresentativeBridgeState } from "./sqlite-fixtures.js";

describe("sqlite-store", () => {
  test("initializes all bridge state tables", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-sqlite-"));
    const database = initializeSqliteStore(join(tempDirectory, "bridge.db"));
    try {
      const tables = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;

      expect(tables.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "contacts",
          "sessions",
          "jobs",
          "job_logs",
          "attachments",
          "processed_messages",
          "outbound_messages",
          "metadata"
        ])
      );
    } finally {
      database.close();
    }
  });

  test("persists and reloads a complete bridge state snapshot", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-sqlite-"));
    const database = initializeSqliteStore(join(tempDirectory, "bridge.db"));
    const state = createRepresentativeBridgeState();
    try {
      writeBridgeStateToSqlite(database, state);

      expect(readBridgeStateFromSqlite(database)).toEqual(state);
      expect(
        (
          database.prepare("SELECT COUNT(*) AS count FROM job_logs").get() as {
            count: number;
          }
        ).count
      ).toBe(4);
    } finally {
      database.close();
    }
  });
});
