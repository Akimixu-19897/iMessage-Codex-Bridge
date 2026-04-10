import { createImsgJsonStreamParser } from "../adapters/imsg/imsg-json-stream.js";
import type { BridgeConfig } from "../config/schema.js";
import { createBridgeService } from "./bridge-service.js";
import type { ParsedBridgeAdminCommand } from "./admin-command.js";
import type { ParsedBridgeJobCommand } from "./job-command.js";
import type { ParsedBridgeSessionCommand } from "./session-command.js";

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

type SessionCommandAction = {
  type: "session_command";
  handle: string;
  command: ParsedBridgeSessionCommand;
};

type JobCommandAction = {
  type: "job_command";
  handle: string;
  command: ParsedBridgeJobCommand;
};

export type BridgeRuntimeAction =
  | RejectAction
  | SubmitAction
  | CommandAction
  | SessionCommandAction
  | JobCommandAction;

type CreateBridgeRuntimeOptions = {
  contactsProvider?: () => BridgeConfig["contacts"];
  adminHandles?: string[];
};

export function createBridgeRuntime(
  config: BridgeConfig,
  options: CreateBridgeRuntimeOptions = {}
) {
  const bridgeService = createBridgeService(config, options);
  const pendingActions: BridgeRuntimeAction[] = [];
  const streamParser = createImsgJsonStreamParser({
    onMessage: (message) => {
      const result = bridgeService.handleIncomingMessage(message);

      if (result.type === "session_command") {
        const flushedBatches = bridgeService.flushHandle(result.handle).map((batch) => ({
          type: "submit" as const,
          batch
        }));

        pendingActions.push(...flushedBatches, result);
        return;
      }

      if (result.type === "reject" || result.type === "command" || result.type === "job_command") {
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
