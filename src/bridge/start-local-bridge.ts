import { createAppServerStdioHost } from "../adapters/codex/app-server-stdio-host.js";
import { createImsgClient } from "../adapters/imsg/imsg-client.js";
import { createImsgWatchHost } from "../adapters/imsg/imsg-watch-host.js";
import type { BridgeConfig } from "../config/schema.js";
import {
  createJsonBridgeStateRepository,
  createSqliteBridgeStateRepository,
  type BridgeStateRepository
} from "../state/bridge-state-repository.js";
import { applyJobRetentionPolicy } from "../state/retention.js";
import type { BridgeState } from "../state/state-store.js";
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
  databasePath?: string;
  useSqlite?: boolean;
  jobRetentionDays?: number;
  maxCompletedJobs?: number;
  attachmentDirectory?: string;
  logLevel?: "silent" | "info" | "debug";
  ensureWorkspaceDirectory?: (path: string) => Promise<void>;
  loadBridgeState?: (options: {
    path: string;
    config: BridgeConfig;
  }) => Promise<BridgeState>;
  createStateRepository?: (options: {
    config: BridgeConfig;
    statePath: string;
    databasePath?: string;
    useSqlite?: boolean;
  }) => BridgeStateRepository;
  createAppServerHost?: (options: {
    onNotification: (notification: { method: string; params?: unknown }) => void;
  }) => AppServerHost;
  createLocalRuntime?: (options: {
    config: BridgeConfig;
    state: BridgeState;
    statePath: string;
    attachmentDirectory?: string;
    databasePath?: string;
    useSqlite?: boolean;
    saveState?: (state: BridgeState) => Promise<void>;
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
  const stateRepository =
    options.createStateRepository?.({
      config: options.config,
      statePath: options.statePath,
      databasePath: options.databasePath,
      useSqlite: options.useSqlite
    }) ??
    createDefaultStateRepository({
      config: options.config,
      statePath: options.statePath,
      databasePath: options.databasePath,
      useSqlite: options.useSqlite,
      loadBridgeState: options.loadBridgeState
    });
  const state = await stateRepository.loadSnapshot();
  const retention = applyJobRetentionPolicy(state, {
    now: Date.now(),
    retentionDays: options.jobRetentionDays,
    maxCompletedJobs: options.maxCompletedJobs
  });
  if (retention.removedJobs > 0) {
    await stateRepository.saveSnapshot(state);
  }
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
    databasePath: options.databasePath,
    useSqlite: options.useSqlite,
    saveState: (nextState) => stateRepository.saveSnapshot(nextState),
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
      stateRepository.close?.();
    }
  };
}

function createDefaultStateRepository(options: {
  config: BridgeConfig;
  statePath: string;
  databasePath?: string;
  useSqlite?: boolean;
  loadBridgeState?: (options: {
    path: string;
    config: BridgeConfig;
  }) => Promise<BridgeState>;
}): BridgeStateRepository {
  if (options.useSqlite) {
    if (!options.databasePath) {
      throw new Error("启用 SQLite 时必须提供 databasePath");
    }

    return createSqliteBridgeStateRepository({
      databasePath: options.databasePath,
      config: options.config
    });
  }

  if (options.loadBridgeState) {
    return {
      loadSnapshot: () =>
        options.loadBridgeState!({
          path: options.statePath,
          config: options.config
        }),
      saveSnapshot: (state) =>
        createJsonBridgeStateRepository({
          path: options.statePath,
          config: options.config
        }).saveSnapshot(state)
    };
  }

  return createJsonBridgeStateRepository({
    path: options.statePath,
    config: options.config
  });
}
