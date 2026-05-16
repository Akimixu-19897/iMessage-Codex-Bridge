import type { ImsgAvailability } from "../adapters/imsg/imsg-client.js";
import type { BridgeConfig } from "../config/schema.js";

type BootstrapBridgeOptions = {
  configPath: string;
  loadConfig: (configPath: string) => Promise<BridgeConfig>;
  detectImsgAvailability: () => Promise<ImsgAvailability>;
};

type BootstrapBlockedResult = {
  status: "blocked";
  reason: "imsg_unavailable";
  config: BridgeConfig;
};

type BootstrapReadyResult = {
  status: "ready";
  executablePath: string;
  config: BridgeConfig;
};

export type BootstrapBridgeResult = BootstrapBlockedResult | BootstrapReadyResult;

export async function bootstrapBridge(
  options: BootstrapBridgeOptions
): Promise<BootstrapBridgeResult> {
  const config = await options.loadConfig(options.configPath);
  const availability = await options.detectImsgAvailability();

  if (!availability.available || !availability.executablePath) {
    return {
      status: "blocked",
      reason: "imsg_unavailable",
      config
    };
  }

  return {
    status: "ready",
    executablePath: availability.executablePath,
    config
  };
}
