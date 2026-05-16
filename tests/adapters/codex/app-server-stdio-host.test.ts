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

async function waitForCondition(condition: () => void, attempts = 20): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      condition();
      return;
    } catch (error) {
      lastError = error;
      await Promise.resolve();
    }
  }

  throw lastError;
}

describe("createAppServerStdioHost", () => {
  test("spawns codex app-server over stdio and sends JSON-RPC requests", async () => {
    const fakeChild = createFakeChildProcess();
    const spawnProcess = vi.fn(() => fakeChild.process);
    let nextRequestId = 0;
    const host = createAppServerStdioHost({
      spawnProcess,
      nextRequestId: () => {
        nextRequestId += 1;
        return nextRequestId;
      }
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
        method: "initialize",
        params: {
          clientInfo: {
            name: "imessage-codex-bridge",
            title: "iMessage Codex Bridge",
            version: "0.1.0"
          },
          capabilities: {
            experimentalApi: true,
            optOutNotificationMethods: []
          }
        }
      })}\n`
    ]);

    fakeChild.stdout.emit(
      "data",
      Buffer.from('{"id":1,"result":{"userAgent":"imessage-codex-bridge/0.1.0"}}\n')
    );
    await waitForCondition(() => {
      expect(fakeChild.stdinWrites).toHaveLength(3);
    });

    expect(fakeChild.stdinWrites).toEqual([
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          clientInfo: {
            name: "imessage-codex-bridge",
            title: "iMessage Codex Bridge",
            version: "0.1.0"
          },
          capabilities: {
            experimentalApi: true,
            optOutNotificationMethods: []
          }
        }
      })}\n`,
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "initialized"
      })}\n`,
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "thread/start",
        params: {
          cwd: "/tmp/workspace-a"
        }
      })}\n`
    ]);

    fakeChild.stdout.emit(
      "data",
      Buffer.from('{"id":2,"result":{"thread":{"id":"thread-1"}}}\n')
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

  test("forwards server notifications from stdout", async () => {
    const fakeChild = createFakeChildProcess();
    const onNotification = vi.fn();
    const host = createAppServerStdioHost({
      spawnProcess: () => fakeChild.process,
      onNotification
    });

    const session = host.start();
    fakeChild.stdout.emit(
      "data",
      Buffer.from('{"id":1,"result":{"userAgent":"imessage-codex-bridge/0.1.0"}}\n')
    );
    await Promise.resolve();
    fakeChild.stdout.emit(
      "data",
      Buffer.from(
        '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","status":"completed"}}}\n'
      )
    );

    expect(onNotification).toHaveBeenCalledWith({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed"
        }
      }
    });
    session.close();
  });
});
