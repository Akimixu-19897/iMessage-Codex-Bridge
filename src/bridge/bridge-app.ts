import type { BridgeOutboundResult } from "./bridge-outbound-dispatcher.js";
import type { BridgeExecutionAction } from "./bridge-codex-executor.js";
import type { BridgeConfig } from "../config/schema.js";
import { createBridgeRuntime } from "./bridge-runtime.js";

type CreateBridgeAppOptions = {
  executeRuntimeActions?: (actions: ReturnType<
    ReturnType<typeof createBridgeRuntime>["drainActions"]
  >) => Promise<BridgeExecutionAction[]>;
  dispatchExecutionActions?: (
    actions: BridgeExecutionAction[]
  ) => Promise<BridgeOutboundResult[]>;
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
    },

    async dispatchReadyActions(now: number) {
      const actions = runtime.drainActions(now);

      if (!options.executeRuntimeActions) {
        return actions;
      }

      const executedActions = await options.executeRuntimeActions(actions);

      if (!options.dispatchExecutionActions) {
        return executedActions;
      }

      return options.dispatchExecutionActions(executedActions);
    }
  };
}
