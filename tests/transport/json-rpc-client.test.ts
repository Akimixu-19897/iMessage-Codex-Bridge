import { describe, expect, test, vi } from "vitest";

import { createJsonRpcClient } from "../../src/transport/json-rpc-client.js";

describe("createJsonRpcClient", () => {
  test("sends a JSON-RPC request and resolves the matching result", async () => {
    const sendMessage = vi.fn(async () => {});
    const client = createJsonRpcClient({
      sendMessage,
      nextRequestId: () => 1
    });

    const responsePromise = client.request("thread/start", {
      cwd: "/tmp/workspace-a"
    });

    expect(sendMessage).toHaveBeenCalledWith(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "thread/start",
        params: {
          cwd: "/tmp/workspace-a"
        }
      })}\n`
    );

    client.handleMessage(
      JSON.stringify({
        id: 1,
        result: {
          thread: {
            id: "thread-1"
          }
        }
      })
    );

    await expect(responsePromise).resolves.toEqual({
      thread: {
        id: "thread-1"
      }
    });
  });

  test("rejects the matching request when the server returns a JSON-RPC error", async () => {
    const client = createJsonRpcClient({
      sendMessage: async () => {},
      nextRequestId: () => 2
    });

    const responsePromise = client.request("thread/resume", {
      threadId: "thread-1"
    });

    client.handleMessage(
      JSON.stringify({
        id: 2,
        error: {
          code: -32000,
          message: "thread not found"
        }
      })
    );

    await expect(responsePromise).rejects.toThrow(
      "JSON-RPC -32000: thread not found"
    );
  });

  test("ignores unmatched inbound messages until the correct response arrives", async () => {
    const client = createJsonRpcClient({
      sendMessage: async () => {},
      nextRequestId: () => 3
    });

    const responsePromise = client.request("thread/start", {
      cwd: "/tmp/workspace-b"
    });

    client.handleMessage(
      JSON.stringify({
        method: "thread/started",
        params: {
          thread: {
            id: "ignored"
          }
        }
      })
    );
    client.handleMessage(
      JSON.stringify({
        id: 999,
        result: {
          ignored: true
        }
      })
    );
    client.handleMessage(
      JSON.stringify({
        id: 3,
        result: {
          thread: {
            id: "thread-3"
          }
        }
      })
    );

    await expect(responsePromise).resolves.toEqual({
      thread: {
        id: "thread-3"
      }
    });
  });
});
