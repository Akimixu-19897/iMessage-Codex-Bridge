type BridgeLoopRunnerApp = {
  processImsgChunk(chunk: string): void;
  dispatchReadyActions(now: number): Promise<unknown>;
};

type BridgeLoopRunnerWatchSession = {
  close(): void;
};

type BridgeLoopRunnerWatchHost = {
  start(options: { onChunk: (chunk: string) => void }): BridgeLoopRunnerWatchSession;
};

type CreateBridgeLoopRunnerOptions = {
  app: BridgeLoopRunnerApp;
  watchHost: BridgeLoopRunnerWatchHost;
  now?: () => number;
};

export function createBridgeLoopRunner(options: CreateBridgeLoopRunnerOptions) {
  const now = options.now ?? Date.now;
  let dispatchInFlight: Promise<void> | null = null;
  let flushQueued = false;

  const flush = async () => {
    if (dispatchInFlight) {
      flushQueued = true;
      return;
    }

    dispatchInFlight = options.app.dispatchReadyActions(now()).then(() => {
      return;
    });

    try {
      await dispatchInFlight;
    } finally {
      dispatchInFlight = null;

      if (flushQueued) {
        flushQueued = false;
        void flush();
      }
    }
  };

  return {
    start() {
      const watchSession = options.watchHost.start({
        onChunk: (chunk) => {
          options.app.processImsgChunk(chunk);
          void flush();
        }
      });

      return {
        close(): void {
          watchSession.close();
        }
      };
    }
  };
}
