import type { BridgeExecutionAction } from "./bridge-codex-executor.js";
import type { BridgeConfig } from "../config/schema.js";
import { createBridgeRuntime } from "./bridge-runtime.js";

type CreateBridgeAppOptions = {
  executeRuntimeActions?: (actions: ReturnType<
    ReturnType<typeof createBridgeRuntime>["drainActions"]
  >) => Promise<BridgeExecutionAction[]>;
};

export function createBridgeApp(
  config: BridgeConfig,
  options: CreateBridgeAppOptions = {}
) {
  const runtime = createBridgeRuntime(config);

  return {
    watchArgs: runtime.buildWatchArgs(),

    processImsgChunk(chunk: string): void {
      runtime.pushImsgChunk(chunk);
    },

    drainActions(now: number) {
      return runtime.drainActions(now);
    },

    async executeReadyActions(now: number) {
      const actions = runtime.drainActions(now);

      if (!options.executeRuntimeActions) {
        return actions;
      }

      return options.executeRuntimeActions(actions);
    }
  };
}
