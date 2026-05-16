import { createAppServerStdioHost } from "../adapters/codex/app-server-stdio-host.js";
import { createImsgClient } from "../adapters/imsg/imsg-client.js";
import { createImsgWatchHost } from "../adapters/imsg/imsg-watch-host.js";
import type { BridgeConfig } from "../config/schema.js";
import { loadBridgeState, type BridgeState } from "../state/state-store.js";
import { createBridgeLoopRunner } from "./bridge-loop-runner.js";
import { ensureContactWorkspace } from "./contact-workspace.js";
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
  attachmentDirectory?: string;
  logLevel?: "silent" | "info" | "debug";
  ensureWorkspaceDirectory?: (path: string) => Promise<void>;
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
    attachmentDirectory?: string;
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
    logLevel?: "silent" | "info" | "debug";
  }) => LoopRunner;
  sendTextMessage?: (params: { to: string; text: string }) => Promise<{
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
  const ensureWorkspaceDirectory =
    options.ensureWorkspaceDirectory ?? ensureContactWorkspace;

  const workspacePaths = new Set(
    [...options.config.contacts, ...state.contacts].map((contact) => contact.workspace)
  );

  for (const workspacePath of workspacePaths) {
    await ensureWorkspaceDirectory(workspacePath);
  }

  let localRuntime: LocalBridgeRuntime | null = null;
  const pendingNotifications: Array<{ method: string; params?: unknown }> = [];
  const appServerHostFactory =
    options.createAppServerHost ??
    ((hostOptions) =>
      createAppServerStdioHost({
        onNotification: hostOptions.onNotification
      }));
  const appServerSession = appServerHostFactory({
    onNotification: (notification) => {
      if (!localRuntime) {
        pendingNotifications.push(notification);
        return;
      }

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
    attachmentDirectory: options.attachmentDirectory,
    appServerSession,
    sendTextMessage
  });
  for (const notification of pendingNotifications) {
    localRuntime.handleCodexNotification(notification);
  }

  const createWatchHost = options.createImsgWatchHost ?? createImsgWatchHost;
  const watchHost = createWatchHost({
    executablePath: options.executablePath,
    watchArgs: localRuntime.app.watchArgs
  });
  const createLoopRunner = options.createBridgeLoopRunner ?? createBridgeLoopRunner;
  const loopRunner = createLoopRunner({
    app: localRuntime.app,
    watchHost,
    logLevel: options.logLevel
  });
  const loopSession = loopRunner.start();

  return {
    watchArgs: localRuntime.app.watchArgs,

    close(): void {
      loopSession.close();
      appServerSession.close();
    }
  };
}
