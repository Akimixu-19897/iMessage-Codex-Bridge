import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import { createImsgWatchHost } from "../../../src/adapters/imsg/imsg-watch-host.js";

function createFakeChildProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const kill = vi.fn();

  return {
    process: {
      stdout,
      stderr,
      kill
    },
    stdout,
    kill
  };
}

describe("createImsgWatchHost", () => {
  test("spawns imsg watch and forwards stdout chunks", () => {
    const fakeChild = createFakeChildProcess();
    const spawnProcess = vi.fn(() => fakeChild.process);
    const onChunk = vi.fn();
    const host = createImsgWatchHost({
      executablePath: "/opt/homebrew/bin/imsg",
      watchArgs: [
        "watch",
        "--json",
        "--attachments",
        "--participants",
        "+8613800000000"
      ],
      spawnProcess,
      onChunk
    });

    host.start();
    fakeChild.stdout.emit("data", Buffer.from('{"id":"m1"}\n'));

    expect(spawnProcess).toHaveBeenCalledWith("/opt/homebrew/bin/imsg", [
      "watch",
      "--json",
      "--attachments",
      "--participants",
      "+8613800000000"
    ]);
    expect(onChunk).toHaveBeenCalledWith('{"id":"m1"}\n');
  });

  test("can stop the spawned watch process", () => {
    const fakeChild = createFakeChildProcess();
    const host = createImsgWatchHost({
      executablePath: "/opt/homebrew/bin/imsg",
      watchArgs: ["watch", "--json"],
      spawnProcess: () => fakeChild.process,
      onChunk: () => {}
    });

    const session = host.start();
    session.close();

    expect(fakeChild.kill).toHaveBeenCalledTimes(1);
  });
});
