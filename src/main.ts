import { bootstrapBridge, type BootstrapBridgeResult } from "./bridge/bootstrap-bridge.js";
import { startLocalBridge } from "./bridge/start-local-bridge.js";
import type { BridgeConfig } from "./config/schema.js";
import { loadConfig } from "./config/load-config.js";

const DEFAULT_CONFIG_PATH = new URL("../config/bridge.example.yaml", import.meta.url)
  .pathname;
const DEFAULT_STATE_PATH = new URL("../data/bridge-state.json", import.meta.url)
  .pathname;
const DEFAULT_ATTACHMENT_DIRECTORY = new URL("../data/attachments", import.meta.url)
  .pathname;

type RunMainOptions = {
  bootstrap?: () => Promise<BootstrapBridgeResult>;
  startBridge?: (options: {
    config: BridgeConfig;
    executablePath: string;
    statePath: string;
    attachmentDirectory: string;
  }) => Promise<{
    close(): void;
    watchArgs: string[];
  }>;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export async function runMain(options: RunMainOptions = {}): Promise<number> {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const statePath = DEFAULT_STATE_PATH;
  const attachmentDirectory = DEFAULT_ATTACHMENT_DIRECTORY;
  const startBridge = options.startBridge ?? startLocalBridge;
  const bootstrap =
    options.bootstrap ??
    (() =>
      bootstrapBridge({
        configPath: DEFAULT_CONFIG_PATH,
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
    attachmentDirectory
  });

  log(
    "bridge ready:",
    JSON.stringify(
        {
          executablePath: result.executablePath,
          contactCount: result.config.contacts.length,
          statePath,
          attachmentDirectory,
          watchArgs: bridge.watchArgs
        },
        null,
        2
    )
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runMain();
  process.exitCode = exitCode;
}
