import { describe, expect, test, vi } from "vitest";

import { createStdioJsonRpc } from "../../src/transport/stdio-json-rpc.js";

describe("createStdioJsonRpc", () => {
  test("resolves a request from newline-delimited stdout chunks", async () => {
    const writeChunk = vi.fn(async () => {});
    const transport = createStdioJsonRpc({
      writeChunk,
      nextRequestId: () => 1
    });

    const responsePromise = transport.request("thread/start", {
      cwd: "/tmp/workspace-a"
    });

    expect(writeChunk).toHaveBeenCalledWith(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "thread/start",
        params: {
          cwd: "/tmp/workspace-a"
        }
      })}\n`
    );

    transport.pushStdoutChunk('{"id":1,"result":{"thread":{"id":"thread-1"}}');
    transport.pushStdoutChunk("}\n");

    await expect(responsePromise).resolves.toEqual({
      thread: {
        id: "thread-1"
      }
    });
  });

  test("skips blank lines and unrelated notifications in stdout", async () => {
    const transport = createStdioJsonRpc({
      writeChunk: async () => {},
      nextRequestId: () => 2
    });

    const responsePromise = transport.request("thread/resume", {
      threadId: "thread-2"
    });

    transport.pushStdoutChunk("\n");
    transport.pushStdoutChunk(
      '{"method":"thread/started","params":{"thread":{"id":"ignored"}}}\n'
    );
    transport.pushStdoutChunk('{"id":2,"result":{"thread":{"id":"thread-2"}}}\n');

    await expect(responsePromise).resolves.toEqual({
      thread: {
        id: "thread-2"
      }
    });
  });

  test("propagates JSON-RPC errors from stdout chunks", async () => {
    const transport = createStdioJsonRpc({
      writeChunk: async () => {},
      nextRequestId: () => 3
    });

    const responsePromise = transport.request("thread/resume", {
      threadId: "thread-3"
    });

    transport.pushStdoutChunk(
      '{"id":3,"error":{"code":-32001,"message":"resume failed"}}\n'
    );

    await expect(responsePromise).rejects.toThrow("JSON-RPC -32001: resume failed");
  });

  test("forwards notification messages to the notification handler", async () => {
    const onNotification = vi.fn();
    const transport = createStdioJsonRpc({
      writeChunk: async () => {},
      onNotification
    });

    transport.pushStdoutChunk(
      '{"method":"item/agentMessage/delta","params":{"turnId":"turn-1","delta":"你好"}}\n'
    );

    expect(onNotification).toHaveBeenCalledWith({
      method: "item/agentMessage/delta",
      params: {
        turnId: "turn-1",
        delta: "你好"
      }
    });
  });
});
