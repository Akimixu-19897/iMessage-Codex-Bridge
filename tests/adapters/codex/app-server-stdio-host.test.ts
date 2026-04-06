import { EventEmitter } from "node:events";

import { describe, expect, test, vi } from "vitest";

import { createAppServerStdioHost } from "../../../src/adapters/codex/app-server-stdio-host.js";

function createFakeChildProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdinWrites: string[] = [];
  const kill = vi.fn();

  return {
    process: {
      stdin: {
        write: (chunk: string, callback?: (error?: Error | null) => void) => {
          stdinWrites.push(chunk);
          callback?.(null);
          return true;
        }
      },
      stdout,
      stderr,
      kill
    },
    stdout,
    stdinWrites,
    kill
  };
}

describe("createAppServerStdioHost", () => {
  test("spawns codex app-server over stdio and sends JSON-RPC requests", async () => {
    const fakeChild = createFakeChildProcess();
    const spawnProcess = vi.fn(() => fakeChild.process);
    const host = createAppServerStdioHost({
      spawnProcess,
      nextRequestId: () => 1
    });

    const session = host.start();
    const responsePromise = session.request("thread/start", {
      cwd: "/tmp/workspace-a"
    });

    expect(spawnProcess).toHaveBeenCalledWith("codex", [
      "app-server",
      "--listen",
      "stdio://"
    ]);
    expect(fakeChild.stdinWrites).toEqual([
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "thread/start",
        params: {
          cwd: "/tmp/workspace-a"
        }
      })}\n`
    ]);

    fakeChild.stdout.emit(
      "data",
      Buffer.from('{"id":1,"result":{"thread":{"id":"thread-1"}}}\n')
    );

    await expect(responsePromise).resolves.toEqual({
      thread: {
        id: "thread-1"
      }
    });
  });

  test("supports custom command arguments and closes the child process", () => {
    const fakeChild = createFakeChildProcess();
    const spawnProcess = vi.fn(() => fakeChild.process);
    const host = createAppServerStdioHost({
      command: "/opt/homebrew/bin/codex",
      args: ["app-server", "--listen", "stdio://", "--disable", "analytics"],
      spawnProcess
    });

    const session = host.start();
    session.close();

    expect(spawnProcess).toHaveBeenCalledWith("/opt/homebrew/bin/codex", [
      "app-server",
      "--listen",
      "stdio://",
      "--disable",
      "analytics"
    ]);
    expect(fakeChild.kill).toHaveBeenCalledTimes(1);
  });
});
