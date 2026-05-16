import type { BridgeOutboundResult } from "./bridge-outbound-dispatcher.js";
import type { BridgeExecutionAction } from "./bridge-codex-executor.js";
import type { BridgeConfig } from "../config/schema.js";
import { createBridgeRuntime } from "./bridge-runtime.js";

type CreateBridgeAppOptions = {
  contactsProvider?: () => BridgeConfig["contacts"];
  adminHandles?: string[];
  executeRuntimeActions?: (
    actions: ReturnType<ReturnType<typeof createBridgeRuntime>["drainActions"]>,
    now: number
  ) => Promise<BridgeExecutionAction[]>;
  pollExecutionActions?: (now: number) => Promise<BridgeExecutionAction[]>;
  dispatchExecutionActions?: (
    actions: BridgeExecutionAction[]
  ) => Promise<BridgeOutboundResult[]>;
};

export function createBridgeApp(
  config: BridgeConfig,
  options: CreateBridgeAppOptions = {}
) {
  const runtime = createBridgeRuntime(config, {
    contactsProvider: options.contactsProvider,
    adminHandles: options.adminHandles
  });

  return {
    watchArgs: runtime.watchArgs,

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

      const executedActions = await options.executeRuntimeActions(actions, now);
      const polledActions = options.pollExecutionActions
        ? await options.pollExecutionActions(now)
        : [];
      return [...executedActions, ...polledActions];
    },

    async dispatchReadyActions(now: number) {
      const actions = runtime.drainActions(now);

      if (!options.executeRuntimeActions) {
        return actions;
      }

      const executedActions = await options.executeRuntimeActions(actions, now);
      const polledActions = options.pollExecutionActions
        ? await options.pollExecutionActions(now)
        : [];
      const allExecutedActions = [...executedActions, ...polledActions];

      if (!options.dispatchExecutionActions) {
        return allExecutedActions;
      }

      return options.dispatchExecutionActions(allExecutedActions);
    }
  };
}
