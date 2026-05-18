import type { BridgeConfig } from "../config/schema.js";
import {
  createInitialBridgeState,
  loadBridgeState,
  saveBridgeState,
  type BridgeState
} from "./state-store.js";
import {
  hasSqliteBridgeState,
  initializeSqliteStore,
  readBridgeStateFromSqlite,
  writeBridgeStateToSqlite
} from "./sqlite-store.js";

export type BridgeStateRepository = {
  loadSnapshot(): Promise<BridgeState>;
  saveSnapshot(state: BridgeState): Promise<void>;
  close?(): void;
};

export function createJsonBridgeStateRepository(options: {
  path: string;
  config: BridgeConfig;
}): BridgeStateRepository {
  return {
    loadSnapshot: () =>
      loadBridgeState({
        path: options.path,
        config: options.config
      }),
    saveSnapshot: (state) =>
      saveBridgeState({
        path: options.path,
        state
      })
  };
}

export function createSqliteBridgeStateRepository(options: {
  databasePath: string;
  config: BridgeConfig;
}): BridgeStateRepository {
  const database = initializeSqliteStore(options.databasePath);

  return {
    async loadSnapshot() {
      if (!hasSqliteBridgeState(database)) {
        const state = createInitialBridgeState(options.config);
        writeBridgeStateToSqlite(database, state);
        return state;
      }

      return readBridgeStateFromSqlite(database);
    },
    async saveSnapshot(state) {
      writeBridgeStateToSqlite(database, state);
    },
    close() {
      database.close();
    }
  };
}
