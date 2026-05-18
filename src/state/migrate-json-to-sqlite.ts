import type { BridgeState } from "./state-store.js";
import {
  hasSqliteBridgeState,
  initializeSqliteStore,
  writeBridgeStateToSqlite
} from "./sqlite-store.js";

export function migrateBridgeStateToSqlite(params: {
  state: BridgeState;
  databasePath: string;
  overwrite?: boolean;
}): void {
  const database = initializeSqliteStore(params.databasePath);
  try {
    if (hasSqliteBridgeState(database) && params.overwrite !== true) {
      throw new Error(
        `SQLite 数据库已有 bridge 状态，请备份后使用 --overwrite 覆盖: ${params.databasePath}`
      );
    }

    writeBridgeStateToSqlite(database, params.state);
  } finally {
    database.close();
  }
}
