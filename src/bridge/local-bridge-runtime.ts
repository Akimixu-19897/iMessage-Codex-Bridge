import { dirname, join } from "node:path";

import { createCodexAppServerClient } from "../adapters/codex/app-server-client.js";
import { createThreadService } from "../adapters/codex/thread-service.js";
import { resolveThreadPolicy } from "../adapters/codex/thread-policy.js";
import { createTurnResponseCollector } from "../adapters/codex/turn-response-collector.js";
import { createTurnService } from "../adapters/codex/turn-service.js";
import { stageAttachments } from "../attachments/stage-attachments.js";
import type { BridgeConfig } from "../config/schema.js";
import { createSessionManager } from "../state/session-manager.js";
import type { BridgeState } from "../state/state-store.js";
import { saveBridgeState } from "../state/state-store.js";
import { createAdminCommandExecutor } from "./admin-command-executor.js";
import { createBridgeApp } from "./bridge-app.js";
import { createBridgeCodexExecutor } from "./bridge-codex-executor.js";
import { createJobManager } from "./job-manager.js";
import { createBridgeOutboundDispatcher } from "./bridge-outbound-dispatcher.js";
import { createSessionCommandExecutor } from "./session-command-executor.js";

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
  const adminHandles =
    options.config.adminHandles && options.config.adminHandles.length > 0
      ? options.config.adminHandles
      : options.config.contacts.map((contact) => contact.handle);
  const saveState = () =>
    saveBridgeState({
      path: options.statePath,
      state: options.state
    });
  const adminCommandExecutor = createAdminCommandExecutor({
    sessionManager,
    saveState
  });
  const sessionCommandExecutor = createSessionCommandExecutor({
    sessionManager,
    saveState
  });
  const jobManager = createJobManager({
    state: options.state,
    saveState
  });
  void jobManager.recoverInterruptedJobs?.(Date.now());
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
    resolveThreadPolicy: ({ handle, workspace }) =>
      resolveThreadPolicy({
        handle,
        workspace,
        adminHandles
      }),
    saveState
  });
  const turnService = createTurnService({
    appServerClient,
    threadService
  });
  const bridgeCodexExecutor = createBridgeCodexExecutor({
    jobManager,
    executeAdminCommand: ({ handle, command }) =>
      adminCommandExecutor.execute(command, handle),
    executeSessionCommand: ({ handle, command }) =>
      sessionCommandExecutor.execute({
        handle,
        command
      }),
    resolveCurrentSessionId: (handle) =>
      sessionManager.getContact(handle).currentSessionId,
    interruptTurn: ({ threadId, turnId }) =>
      appServerClient.interruptTurn({
        threadId,
        turnId
      }),
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
    cancelWaitForTurn: ({ turnId }) => {
      turnResponseCollector.cancelTurn(turnId);
    },
    turnTimeoutMs: {
      foreground: 10 * 60_000,
      background: 30 * 60_000,
      autoresearch: 8 * 60 * 60_000
    },
    codexUnavailableMessage: "抱歉，Codex 暂时不可用，请稍后再试。"
  });
  const bridgeOutboundDispatcher = createBridgeOutboundDispatcher({
    sendTextMessage: options.sendTextMessage,
    logError
  });
  const app = createBridgeApp(options.config, {
    contactsProvider: () => options.state.contacts,
    adminHandles: options.config.adminHandles,
    executeRuntimeActions: (actions, now) =>
      bridgeCodexExecutor.execute(actions, now),
    pollExecutionActions: (now) => bridgeCodexExecutor.poll(now),
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
