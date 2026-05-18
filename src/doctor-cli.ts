import { access } from "node:fs/promises";

import { formatDoctorResult, runDoctor } from "./doctor.js";

const DEFAULT_CONFIG_PATH = new URL("../config/bridge.local.yaml", import.meta.url)
  .pathname;
const FALLBACK_CONFIG_PATH = new URL("../config/bridge.example.yaml", import.meta.url)
  .pathname;
const DEFAULT_STATE_PATH = new URL("../data/bridge-state.json", import.meta.url)
  .pathname;
const DEFAULT_DATABASE_PATH = new URL("../data/bridge.db", import.meta.url).pathname;
const DEFAULT_ATTACHMENT_DIRECTORY = new URL("../data/attachments", import.meta.url)
  .pathname;

const configPath = await resolveConfigPath();
const result = await runDoctor({
  configPath,
  statePath: process.env.BRIDGE_STATE_PATH ?? DEFAULT_STATE_PATH,
  databasePath: process.env.BRIDGE_DB_PATH ?? DEFAULT_DATABASE_PATH,
  attachmentDirectory: process.env.BRIDGE_ATTACHMENT_DIR ?? DEFAULT_ATTACHMENT_DIRECTORY
});

console.log(formatDoctorResult(result));
process.exitCode = result.ok ? 0 : 1;

async function resolveConfigPath(): Promise<string> {
  if (process.env.BRIDGE_CONFIG_PATH) {
    return process.env.BRIDGE_CONFIG_PATH;
  }

  try {
    await access(DEFAULT_CONFIG_PATH);
    return DEFAULT_CONFIG_PATH;
  } catch {
    return FALLBACK_CONFIG_PATH;
  }
}
