import { access } from "node:fs/promises";

import {
  bootstrapBridge,
  type BootstrapBridgeResult
} from "./bridge/bootstrap-bridge.js";
import { startLocalBridge } from "./bridge/start-local-bridge.js";
import type { BridgeConfig } from "./config/schema.js";
import { loadConfig } from "./config/load-config.js";
import { parseOptionalPositiveInteger } from "./state/retention.js";

const DEFAULT_CONFIG_PATH = new URL("../config/bridge.local.yaml", import.meta.url)
  .pathname;
const FALLBACK_CONFIG_PATH = new URL("../config/bridge.example.yaml", import.meta.url)
  .pathname;
const DEFAULT_STATE_PATH = new URL("../data/bridge-state.json", import.meta.url)
  .pathname;
const DEFAULT_DATABASE_PATH = new URL("../data/bridge.db", import.meta.url).pathname;
const DEFAULT_ATTACHMENT_DIRECTORY = new URL("../data/attachments", import.meta.url)
  .pathname;

type BridgeLogLevel = "silent" | "info" | "debug";

type RunMainOptions = {
  bootstrap?: () => Promise<BootstrapBridgeResult>;
  startBridge?: (options: {
    config: BridgeConfig;
    executablePath: string;
    statePath: string;
    databasePath: string;
    useSqlite: boolean;
    jobRetentionDays?: number;
    maxCompletedJobs?: number;
    attachmentDirectory: string;
    logLevel?: BridgeLogLevel;
  }) => Promise<{
    close(): void;
    watchArgs: string[];
  }>;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  env?: NodeJS.ProcessEnv;
};

export async function runMain(options: RunMainOptions = {}): Promise<number> {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const env = options.env ?? process.env;
  const statePath = env.BRIDGE_STATE_PATH ?? DEFAULT_STATE_PATH;
  const databasePath = env.BRIDGE_DB_PATH ?? DEFAULT_DATABASE_PATH;
  const useSqlite = env.BRIDGE_USE_SQLITE === "1" || Boolean(env.BRIDGE_DB_PATH);
  const jobRetentionDays = parseOptionalPositiveInteger(env.BRIDGE_JOB_RETENTION_DAYS);
  const maxCompletedJobs = parseOptionalPositiveInteger(env.BRIDGE_MAX_COMPLETED_JOBS);
  const attachmentDirectory = env.BRIDGE_ATTACHMENT_DIR ?? DEFAULT_ATTACHMENT_DIRECTORY;
  const logLevel = parseLogLevel(env.BRIDGE_LOG_LEVEL);
  const configPath = await resolveConfigPath(env);
  const startBridge = options.startBridge ?? startLocalBridge;
  const bootstrap =
    options.bootstrap ??
    (() =>
      bootstrapBridge({
        configPath,
        loadConfig,
        detectImsgAvailability: async () => {
          const { createImsgClient } = await import("./adapters/imsg/imsg-client.js");
          return createImsgClient({}).detectAvailability();
        }
      }));

  const result = await bootstrap();

  if (result.status === "blocked") {
    error("bridge bootstrap blocked:", result.reason);
    return 1;
  }

  const bridge = await startBridge({
    config: result.config,
    executablePath: result.executablePath,
    statePath,
    databasePath,
    useSqlite,
    jobRetentionDays,
    maxCompletedJobs,
    attachmentDirectory,
    logLevel
  });

  log(
    "bridge ready:",
    JSON.stringify(
      {
        executablePath: result.executablePath,
        contactCount: result.config.contacts.length,
        statePath,
        databasePath,
        useSqlite,
        jobRetentionDays,
        maxCompletedJobs,
        attachmentDirectory,
        logLevel,
        watchArgs: bridge.watchArgs
      },
      null,
      2
    )
  );
  return 0;
}

async function resolveConfigPath(env: NodeJS.ProcessEnv): Promise<string> {
  if (env.BRIDGE_CONFIG_PATH) {
    return env.BRIDGE_CONFIG_PATH;
  }

  try {
    await access(DEFAULT_CONFIG_PATH);
    return DEFAULT_CONFIG_PATH;
  } catch {
    return FALLBACK_CONFIG_PATH;
  }
}

function parseLogLevel(value: string | undefined): BridgeLogLevel {
  if (value === "silent" || value === "debug") {
    return value;
  }

  return "info";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runMain();
  process.exitCode = exitCode;
}
