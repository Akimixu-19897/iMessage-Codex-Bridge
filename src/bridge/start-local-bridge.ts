import { createAppServerStdioHost } from "../adapters/codex/app-server-stdio-host.js";
import { createImsgClient } from "../adapters/imsg/imsg-client.js";
import { createImsgWatchHost } from "../adapters/imsg/imsg-watch-host.js";
import type { BridgeConfig } from "../config/schema.js";
import {
  loadBridgeState,
  type BridgeState
} from "../state/state-store.js";
import { createBridgeLoopRunner } from "./bridge-loop-runner.js";
import { createLocalBridgeRuntime } from "./local-bridge-runtime.js";

type AppServerSession = {
  request(method: string, params?: unknown): Promise<unknown>;
  close(): void;
};

type AppServerHost = {
  start(): AppServerSession;
};

type LocalBridgeRuntime = ReturnType<typeof createLocalBridgeRuntime>;

type WatchHost = {
  start(options: { onChunk: (chunk: string) => void }): {
    close(): void;
  };
};

type LoopRunner = {
  start(): {
    close(): void;
  };
};

type StartLocalBridgeOptions = {
  config: BridgeConfig;
  executablePath: string;
  statePath: string;
  loadBridgeState?: (options: {
    path: string;
    config: BridgeConfig;
  }) => Promise<BridgeState>;
  createAppServerHost?: (options: {
    onNotification: (notification: { method: string; params?: unknown }) => void;
  }) => AppServerHost;
  createLocalRuntime?: (options: {
    config: BridgeConfig;
    state: BridgeState;
    statePath: string;
    appServerSession: AppServerSession;
    sendTextMessage: (params: { to: string; text: string }) => Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
    }>;
  }) => LocalBridgeRuntime;
  createImsgWatchHost?: (options: {
    executablePath: string;
    watchArgs: string[];
  }) => WatchHost;
  createBridgeLoopRunner?: (options: {
    app: LocalBridgeRuntime["app"];
    watchHost: WatchHost;
  }) => LoopRunner;
  sendTextMessage?: (params: {
    to: string;
    text: string;
  }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

export async function startLocalBridge(options: StartLocalBridgeOptions) {
  const loadState = options.loadBridgeState ?? loadBridgeState;
  const state = await loadState({
    path: options.statePath,
    config: options.config
  });

  let localRuntime: LocalBridgeRuntime;
  const appServerHostFactory =
    options.createAppServerHost ??
    ((hostOptions) =>
      createAppServerStdioHost({
        onNotification: hostOptions.onNotification
      }));
  const appServerSession = appServerHostFactory({
    onNotification: (notification) => {
      localRuntime.handleCodexNotification(notification);
    }
  }).start();

  const sendTextMessage =
    options.sendTextMessage ??
    ((params) => createImsgClient({}).sendTextMessage(params));
  const createRuntime = options.createLocalRuntime ?? createLocalBridgeRuntime;
  localRuntime = createRuntime({
    config: options.config,
    state,
    statePath: options.statePath,
    appServerSession,
    sendTextMessage
  });

  const createWatchHost = options.createImsgWatchHost ?? createImsgWatchHost;
  const watchHost = createWatchHost({
    executablePath: options.executablePath,
    watchArgs: localRuntime.app.watchArgs
  });
  const createLoopRunner =
    options.createBridgeLoopRunner ?? createBridgeLoopRunner;
  const loopRunner = createLoopRunner({
    app: localRuntime.app,
    watchHost
  });
  const loopSession = loopRunner.start();

  return {
    close(): void {
      loopSession.close();
      appServerSession.close();
    }
  };
}
