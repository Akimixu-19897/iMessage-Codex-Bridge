import { createImsgJsonStreamParser } from "../adapters/imsg/imsg-json-stream.js";
import type { BridgeConfig } from "../config/schema.js";
import { createBridgeService } from "./bridge-service.js";
import type { ParsedBridgeAdminCommand } from "./admin-command.js";

type RejectAction = {
  type: "reject";
  handle: string;
  message: string;
};

type SubmitAction = {
  type: "submit";
  batch: ReturnType<ReturnType<typeof createBridgeService>["flushReady"]>[number];
};

type CommandAction = {
  type: "command";
  handle: string;
  command: ParsedBridgeAdminCommand;
};

export type BridgeRuntimeAction = RejectAction | SubmitAction | CommandAction;

type CreateBridgeRuntimeOptions = {
  contactsProvider?: () => BridgeConfig["contacts"];
  adminHandles?: string[];
};

export function createBridgeRuntime(
  config: BridgeConfig,
  options: CreateBridgeRuntimeOptions = {}
) {
  const bridgeService = createBridgeService(config, options);
  const pendingActions: Array<RejectAction | CommandAction> = [];
  const streamParser = createImsgJsonStreamParser({
    onMessage: (message) => {
      const result = bridgeService.handleIncomingMessage(message);

      if (result.type === "reject" || result.type === "command") {
        pendingActions.push(result);
      }
    }
  });

  const watchArgs = bridgeService.buildWatchArgs();

  return {
    watchArgs,

    buildWatchArgs(): string[] {
      return watchArgs;
    },

    pushImsgChunk(chunk: string): void {
      streamParser.pushChunk(chunk);
    },

    drainActions(now: number): BridgeRuntimeAction[] {
      const flushedBatches = bridgeService.flushReady(now).map((batch) => ({
        type: "submit" as const,
        batch
      }));

      const actions = [...pendingActions, ...flushedBatches];
      pendingActions.length = 0;
      return actions;
    }
  };
}
