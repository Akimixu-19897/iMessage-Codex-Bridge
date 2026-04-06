import { createImsgJsonStreamParser } from "../adapters/imsg/imsg-json-stream.js";
import type { BridgeConfig } from "../config/schema.js";
import { createBridgeService } from "./bridge-service.js";

type RejectAction = {
  type: "reject";
  handle: string;
  message: string;
};

type SubmitAction = {
  type: "submit";
  batch: ReturnType<ReturnType<typeof createBridgeService>["flushReady"]>[number];
};

export type BridgeRuntimeAction = RejectAction | SubmitAction;

export function createBridgeRuntime(config: BridgeConfig) {
  const bridgeService = createBridgeService(config);
  const pendingActions: BridgeRuntimeAction[] = [];
  const streamParser = createImsgJsonStreamParser({
    onMessage: (message) => {
      const result = bridgeService.handleIncomingMessage(message);

      if (result.type === "reject") {
        pendingActions.push(result);
      }
    }
  });

  return {
    buildWatchArgs(): string[] {
      return bridgeService.buildWatchArgs();
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
