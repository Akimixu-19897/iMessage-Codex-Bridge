import { describe, expect, test, vi } from "vitest";

import { createBridgeLoopRunner } from "../../src/bridge/bridge-loop-runner.js";

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

    expect(processImsgChunk).toHaveBeenCalledTimes(2);
    expect(dispatchReadyActions).toHaveBeenCalledTimes(1);

    resolveDispatch?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(dispatchReadyActions).toHaveBeenCalledTimes(2);
    expect(dispatchReadyActions).toHaveBeenNthCalledWith(1, 9000);
    expect(dispatchReadyActions).toHaveBeenNthCalledWith(2, 9000);
  });
});
