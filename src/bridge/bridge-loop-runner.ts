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
  logInfo?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
  flushIntervalMs?: number;
  setIntervalFn?: (
    callback: () => void,
    intervalMs: number
  ) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (intervalId: ReturnType<typeof setInterval>) => void;
};

export function createBridgeLoopRunner(options: CreateBridgeLoopRunnerOptions) {
  const now = options.now ?? Date.now;
  const logInfo = options.logInfo ?? console.log;
  const logError = options.logError ?? console.error;
  const flushIntervalMs = options.flushIntervalMs ?? 1000;
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let dispatchInFlight: Promise<void> | null = null;
  let flushQueued = false;

  const flush = async () => {
    if (dispatchInFlight) {
      flushQueued = true;
      return;
    }

    dispatchInFlight = Promise.resolve()
      .then(() => options.app.dispatchReadyActions(now()))
      .then((results) => {
        if (Array.isArray(results) && results.length > 0) {
          logInfo("bridge dispatch result:", JSON.stringify(results, null, 2));
        }
      });

    try {
      await dispatchInFlight;
    } catch (error: unknown) {
      logError("bridge dispatch failed:", error);
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
      const flushInterval = setIntervalFn(() => {
        void flush();
      }, flushIntervalMs);
      const watchSession = options.watchHost.start({
        onChunk: (chunk) => {
          logInfo("bridge inbound chunk:", chunk.trim());
          try {
            options.app.processImsgChunk(chunk);
          } catch (error: unknown) {
            logError("bridge inbound chunk processing failed:", error);
            return;
          }
          void flush();
        }
      });

      return {
        close(): void {
          clearIntervalFn(flushInterval);
          watchSession.close();
        }
      };
    }
  };
}
