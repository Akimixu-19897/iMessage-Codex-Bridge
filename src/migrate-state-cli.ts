import { readFile } from "node:fs/promises";

import { migrateBridgeStateToSqlite } from "./state/migrate-json-to-sqlite.js";
import { bridgeStateSchema } from "./state/state-store.js";

type CliOptions = {
  statePath: string;
  databasePath: string;
  overwrite: boolean;
};

const options = parseArgs(process.argv.slice(2));
const rawState = JSON.parse(await readFile(options.statePath, "utf8")) as unknown;
const state = bridgeStateSchema.parse(rawState);

migrateBridgeStateToSqlite({
  state,
  databasePath: options.databasePath,
  overwrite: options.overwrite
});

console.log(`OK migrated: ${options.statePath} -> ${options.databasePath}`);

function parseArgs(args: string[]): CliOptions {
  let statePath: string | undefined;
  let databasePath: string | undefined;
  let overwrite = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--state") {
      statePath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--database") {
      databasePath = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--overwrite") {
      overwrite = true;
      continue;
    }

    throw new Error(`未知参数: ${arg}`);
  }

  if (!statePath || !databasePath) {
    throw new Error(
      "用法: tsx src/migrate-state-cli.ts --state data/bridge-state.json --database data/bridge.db [--overwrite]"
    );
  }

  return {
    statePath,
    databasePath,
    overwrite
  };
}
