import { createCodexAppServerClient } from "../adapters/codex/app-server-client.js";
import { createThreadService } from "../adapters/codex/thread-service.js";
import { createTurnResponseCollector } from "../adapters/codex/turn-response-collector.js";
import { createTurnService } from "../adapters/codex/turn-service.js";
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
    submitTextTurn: ({ handle, text }) =>
      turnService.submitTextTurn({
        handle,
        text
      }),
    waitForTurn: ({ threadId, turnId }) =>
      turnResponseCollector.waitForTurn({
        threadId,
        turnId
      })
  });
  const bridgeOutboundDispatcher = createBridgeOutboundDispatcher({
    sendTextMessage: options.sendTextMessage
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
