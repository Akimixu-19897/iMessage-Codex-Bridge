import { dirname, join } from "node:path";

import { createCodexAppServerClient } from "../adapters/codex/app-server-client.js";
import { createThreadService } from "../adapters/codex/thread-service.js";
import { createTurnResponseCollector } from "../adapters/codex/turn-response-collector.js";
import { createTurnService } from "../adapters/codex/turn-service.js";
import { stageAttachments } from "../attachments/stage-attachments.js";
import type { BridgeConfig } from "../config/schema.js";
import { createSessionManager } from "../state/session-manager.js";
import type { BridgeState } from "../state/state-store.js";
import { saveBridgeState } from "../state/state-store.js";
import { createBridgeApp } from "./bridge-app.js";
import { createBridgeCodexExecutor } from "./bridge-codex-executor.js";
import { createBridgeOutboundDispatcher } from "./bridge-outbound-dispatcher.js";

type AppServerSession = {
  request(method: string, params?: unknown): Promise<unknown>;
};

type CreateLocalBridgeRuntimeOptions = {
  config: BridgeConfig;
  state: BridgeState;
  statePath: string;
  appServerSession: AppServerSession;
  attachmentDirectory?: string;
  logError?: (...args: unknown[]) => void;
  sendTextMessage: (params: {
    to: string;
    text: string;
  }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

export function createLocalBridgeRuntime(
  options: CreateLocalBridgeRuntimeOptions
) {
  const attachmentDirectory =
    options.attachmentDirectory ??
    join(dirname(options.statePath), "attachments");
  const logError = options.logError ?? console.error;
  const turnResponseCollector = createTurnResponseCollector();
  const sessionManager = createSessionManager(options.state);
  const saveState = () =>
    saveBridgeState({
      path: options.statePath,
      state: options.state
    });
  const appServerClient = createCodexAppServerClient({
    invokeRequest: (request) =>
      options.appServerSession.request(
        request.method,
        request.params
      ) as Promise<any>
  });
  const threadService = createThreadService({
    appServerClient,
    sessionManager,
    saveState
  });
  const turnService = createTurnService({
    appServerClient,
    threadService
  });
  const bridgeCodexExecutor = createBridgeCodexExecutor({
    submitTextTurn: async ({ handle, text, imagePaths, messageIds }) => {
      let stagedAttachments: Awaited<ReturnType<typeof stageAttachments>> = [];

      if (imagePaths && imagePaths.length > 0 && messageIds && messageIds.length > 0) {
        try {
          stagedAttachments = await stageAttachments({
            handle,
            messageId: messageIds[messageIds.length - 1]!,
            attachmentPaths: imagePaths,
            stagingDirectory: attachmentDirectory
          });
        } catch (error) {
          logError(
            "bridge attachment staging failed, falling back to text-only turn:",
            error
          );
          stagedAttachments = [];
        }
      }

      const submittedTurn = await turnService.submitTextTurn({
        handle,
        text,
        imagePaths: stagedAttachments.map((attachment) => attachment.stagedPath)
      });

      if (stagedAttachments.length > 0) {
        options.state.attachments.push(
          ...stagedAttachments.map((attachment) => ({
            messageId: attachment.messageId,
            handle,
            threadId: submittedTurn.threadId,
            sourcePath: attachment.sourcePath,
            stagedPath: attachment.stagedPath,
            createdAt: attachment.createdAt
          }))
        );
        await saveState();
      }

      return submittedTurn;
    },
    waitForTurn: ({ threadId, turnId }) =>
      turnResponseCollector.waitForTurn({
        threadId,
        turnId
      }),
    codexUnavailableMessage: "抱歉，Codex 暂时不可用，请稍后再试。"
  });
  const bridgeOutboundDispatcher = createBridgeOutboundDispatcher({
    sendTextMessage: options.sendTextMessage,
    logError
  });
  const app = createBridgeApp(options.config, {
    executeRuntimeActions: (actions) => bridgeCodexExecutor.execute(actions),
    dispatchExecutionActions: (actions) => bridgeOutboundDispatcher.dispatch(actions)
  });

  return {
    app,

    handleCodexNotification(notification: {
      method: string;
      params?: unknown;
    }): void {
      turnResponseCollector.handleNotification(notification);
    }
  };
}
