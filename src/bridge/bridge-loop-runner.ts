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
  logLevel?: "silent" | "info" | "debug";
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
  const logLevel = options.logLevel ?? "info";
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
          if (logLevel === "debug") {
            logInfo("bridge dispatch result:", JSON.stringify(results, null, 2));
          } else if (logLevel === "info") {
            logInfo("bridge dispatch result:", redactDispatchResults(results));
          }
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
          if (logLevel === "debug") {
            logInfo("bridge inbound chunk:", chunk.trim());
          } else if (logLevel === "info") {
            logInfo("bridge inbound chunk received:", {
              bytes: Buffer.byteLength(chunk, "utf8")
            });
          }
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

function redactDispatchResults(results: unknown[]): unknown[] {
  return results.map((result) => {
    if (!isRecord(result)) {
      return result;
    }

    return {
      exitCode: result.exitCode,
      handle:
        typeof result.handle === "string" ? redactHandle(result.handle) : result.handle,
      messageLength:
        typeof result.message === "string" ? result.message.length : undefined
    };
  });
}

function redactHandle(handle: string): string {
  if (handle.length <= 8) {
    return "***";
  }

  return `${handle.slice(0, 5)}…${handle.slice(-4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
