import { createJsonRpcClient } from "./json-rpc-client.js";

export type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

type CreateStdioJsonRpcOptions = {
  writeChunk: (chunk: string) => Promise<void>;
  nextRequestId?: () => number;
  onNotification?: (notification: JsonRpcNotification) => void;
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

        const parsedMessage = JSON.parse(trimmedLine) as {
          method?: string;
          params?: unknown;
        };

        if (parsedMessage.method) {
          options.onNotification?.({
            method: parsedMessage.method,
            params: parsedMessage.params
          });
          continue;
        }

        jsonRpcClient.handleMessage(trimmedLine);
      }
    }
  };
}
