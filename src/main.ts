import { createImsgClient } from "./adapters/imsg/imsg-client.js";
import { bootstrapBridge, type BootstrapBridgeResult } from "./bridge/bootstrap-bridge.js";
import { loadConfig } from "./config/load-config.js";

const DEFAULT_CONFIG_PATH = new URL("../config/bridge.example.yaml", import.meta.url)
  .pathname;

type RunMainOptions = {
  bootstrap?: () => Promise<BootstrapBridgeResult>;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

export async function runMain(options: RunMainOptions = {}): Promise<number> {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  const bootstrap =
    options.bootstrap ??
    (() =>
      bootstrapBridge({
        configPath: DEFAULT_CONFIG_PATH,
        loadConfig,
        detectImsgAvailability: () => createImsgClient({}).detectAvailability()
      }));

  const result = await bootstrap();

  if (result.status === "blocked") {
    error("bridge bootstrap blocked:", result.reason);
    return 1;
  }

  log(
    "bridge ready:",
    JSON.stringify(
      {
        executablePath: result.executablePath,
        contactCount: result.config.contacts.length
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
