import { describe, expect, test, vi } from "vitest";

import { createBridgeLoopRunner } from "../../src/bridge/bridge-loop-runner.js";

async function flushAsyncWork() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe("createBridgeLoopRunner", () => {
  test("pipes imsg watch chunks into bridge app and dispatches ready actions", async () => {
    const processImsgChunk = vi.fn();
    const dispatchReadyActions = vi.fn(async () => []);
    const close = vi.fn();
    const start = vi.fn(({ onChunk }: { onChunk: (chunk: string) => void }) => {
      onChunk('{"id":"m1"}\n');
      return { close };
    });
    const now = vi.fn(() => 7000);
    const runner = createBridgeLoopRunner({
      app: {
        processImsgChunk,
        dispatchReadyActions
      },
      watchHost: {
        start
      },
      now
    });

    const session = runner.start();
    await Promise.resolve();

    expect(start).toHaveBeenCalledTimes(1);
    expect(processImsgChunk).toHaveBeenCalledWith('{"id":"m1"}\n');
    expect(dispatchReadyActions).toHaveBeenCalledWith(7000);

    session.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("does not run overlapping dispatches for burst chunks and flushes once more after completion", async () => {
    const processImsgChunk = vi.fn();
    let resolveDispatch: (() => void) | undefined;
    const dispatchReadyActions = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDispatch = resolve;
        })
    );
    let emitChunk = (_chunk: string) => {};
    const runner = createBridgeLoopRunner({
      app: {
        processImsgChunk,
        dispatchReadyActions
      },
      watchHost: {
        start: ({ onChunk }: { onChunk: (chunk: string) => void }) => {
          emitChunk = onChunk;
          return {
            close: vi.fn()
          };
        }
      },
      now: () => 9000
    });

    runner.start();
    emitChunk('{"id":"m1"}\n');
    emitChunk('{"id":"m2"}\n');
    await Promise.resolve();

    expect(processImsgChunk).toHaveBeenCalledTimes(2);
    expect(dispatchReadyActions).toHaveBeenCalledTimes(1);

    resolveDispatch?.();
    await flushAsyncWork();

    expect(dispatchReadyActions).toHaveBeenCalledTimes(2);
    expect(dispatchReadyActions).toHaveBeenNthCalledWith(1, 9000);
    expect(dispatchReadyActions).toHaveBeenNthCalledWith(2, 9000);
  });

  test("logs inbound chunks and non-empty dispatch results for foreground debugging", async () => {
    const logInfo = vi.fn();
    const runner = createBridgeLoopRunner({
      app: {
        processImsgChunk: vi.fn(),
        dispatchReadyActions: vi.fn(async () => [
          {
            handle: "+8613800000000",
            message: "这是 Codex 的回复",
            exitCode: 0
          }
        ])
      },
      watchHost: {
        start: ({ onChunk }: { onChunk: (chunk: string) => void }) => {
          onChunk('{"id":"m1","text":"你好"}\n');
          return {
            close: vi.fn()
          };
        }
      },
      now: () => 7000,
      logInfo
    });

    runner.start();
    await flushAsyncWork();

    expect(logInfo).toHaveBeenNthCalledWith(
      1,
      "bridge inbound chunk:",
      '{"id":"m1","text":"你好"}'
    );
    expect(logInfo).toHaveBeenNthCalledWith(
      2,
      "bridge dispatch result:",
      JSON.stringify(
        [
          {
            handle: "+8613800000000",
            message: "这是 Codex 的回复",
            exitCode: 0
          }
        ],
        null,
        2
      )
    );
  });

  test("flushes buffered messages on a recurring timer even when no new chunk arrives", async () => {
    const processImsgChunk = vi.fn();
    const dispatchReadyActions = vi.fn(async () => []);
    let tick: (() => void) | undefined;
    const close = vi.fn();
    const intervalId = { id: 1 } as unknown as ReturnType<typeof setInterval>;
    const setIntervalFn = vi.fn((callback: () => void, _intervalMs: number) => {
      tick = callback;
      return intervalId;
    });
    const clearIntervalFn = vi.fn();
    const runner = createBridgeLoopRunner({
      app: {
        processImsgChunk,
        dispatchReadyActions
      },
      watchHost: {
        start: ({ onChunk }: { onChunk: (chunk: string) => void }) => {
          onChunk('{"id":"m1","text":"111"}\n');
          return { close };
        }
      },
      now: () => 7000,
      setIntervalFn,
      clearIntervalFn
    });

    const session = runner.start();
    await flushAsyncWork();

    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(dispatchReadyActions).toHaveBeenCalledTimes(1);

    tick?.();
    await flushAsyncWork();

    expect(dispatchReadyActions).toHaveBeenCalledTimes(2);

    session.close();
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("catches chunk processing errors and keeps handling subsequent chunks", async () => {
    const logError = vi.fn();
    const processImsgChunk = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("bad chunk");
      })
      .mockImplementation(() => {});
    const dispatchReadyActions = vi.fn(async () => []);
    let emitChunk = (_chunk: string) => {};
    const runner = createBridgeLoopRunner({
      app: {
        processImsgChunk,
        dispatchReadyActions
      },
      watchHost: {
        start: ({ onChunk }: { onChunk: (chunk: string) => void }) => {
          emitChunk = onChunk;
          return { close: vi.fn() };
        }
      },
      now: () => 7000,
      logError
    });

    runner.start();
    emitChunk('{"id":"bad"}\n');
    emitChunk('{"id":"good"}\n');
    await Promise.resolve();
    await Promise.resolve();

    expect(logError).toHaveBeenCalledWith(
      "bridge inbound chunk processing failed:",
      expect.any(Error)
    );
    expect(processImsgChunk).toHaveBeenCalledTimes(2);
    expect(dispatchReadyActions).toHaveBeenCalledTimes(1);
  });

  test("catches dispatch errors and continues flushing later actions", async () => {
    const logError = vi.fn();
    const processImsgChunk = vi.fn();
    const dispatchReadyActions = vi
      .fn()
      .mockRejectedValueOnce(new Error("dispatch failed"))
      .mockResolvedValueOnce([]);
    let emitChunk = (_chunk: string) => {};
    const runner = createBridgeLoopRunner({
      app: {
        processImsgChunk,
        dispatchReadyActions
      },
      watchHost: {
        start: ({ onChunk }: { onChunk: (chunk: string) => void }) => {
          emitChunk = onChunk;
          return { close: vi.fn() };
        }
      },
      now: () => 7000,
      logError
    });

    runner.start();
    emitChunk('{"id":"m1"}\n');
    await flushAsyncWork();
    emitChunk('{"id":"m2"}\n');
    await flushAsyncWork();

    expect(logError).toHaveBeenCalledWith(
      "bridge dispatch failed:",
      expect.any(Error)
    );
    expect(dispatchReadyActions).toHaveBeenCalledTimes(2);
  });

  test("catches synchronous dispatch throws and continues flushing later actions", async () => {
    const logError = vi.fn();
    const processImsgChunk = vi.fn();
    const dispatchReadyActions = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("sync dispatch failed");
      })
      .mockResolvedValueOnce([]);
    let emitChunk = (_chunk: string) => {};
    const runner = createBridgeLoopRunner({
      app: {
        processImsgChunk,
        dispatchReadyActions
      },
      watchHost: {
        start: ({ onChunk }: { onChunk: (chunk: string) => void }) => {
          emitChunk = onChunk;
          return { close: vi.fn() };
        }
      },
      now: () => 7000,
      logError
    });

    runner.start();
    emitChunk('{"id":"m1"}\n');
    await flushAsyncWork();
    emitChunk('{"id":"m2"}\n');
    await flushAsyncWork();

    expect(logError).toHaveBeenCalledWith(
      "bridge dispatch failed:",
      expect.any(Error)
    );
    expect(dispatchReadyActions).toHaveBeenCalledTimes(2);
  });
});
