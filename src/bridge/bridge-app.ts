import type { BridgeConfig } from "../config/schema.js";
import { createBridgeRuntime } from "./bridge-runtime.js";

export function createBridgeApp(config: BridgeConfig) {
  const runtime = createBridgeRuntime(config);

  return {
    watchArgs: runtime.buildWatchArgs(),

    processImsgChunk(chunk: string): void {
      runtime.pushImsgChunk(chunk);
    },

    drainActions(now: number) {
      return runtime.drainActions(now);
    }
  };
}
