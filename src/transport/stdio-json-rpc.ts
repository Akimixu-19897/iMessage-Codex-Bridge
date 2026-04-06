import { createJsonRpcClient } from "./json-rpc-client.js";

type CreateStdioJsonRpcOptions = {
  writeChunk: (chunk: string) => Promise<void>;
  nextRequestId?: () => number;
};

export function createStdioJsonRpc(options: CreateStdioJsonRpcOptions) {
  const jsonRpcClient = createJsonRpcClient({
    sendMessage: options.writeChunk,
    nextRequestId: options.nextRequestId
  });
  let buffer = "";

  return {
    request(method: string, params?: unknown): Promise<unknown> {
      return jsonRpcClient.request(method, params);
    },

    pushStdoutChunk(chunk: string): void {
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (!trimmedLine) {
          continue;
        }

        jsonRpcClient.handleMessage(trimmedLine);
      }
    }
  };
}
