export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcSuccessResponse = {
  id: number;
  result: unknown;
};

type JsonRpcErrorResponse = {
  id: number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcInboundMessage = JsonRpcSuccessResponse | JsonRpcErrorResponse;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type CreateJsonRpcClientOptions = {
  sendMessage: (serializedMessage: string) => Promise<void>;
  nextRequestId?: () => number;
};

export function createJsonRpcClient(options: CreateJsonRpcClientOptions) {
  const pendingRequests = new Map<number, PendingRequest>();
  const nextRequestId = options.nextRequestId ?? createDefaultRequestId;

  return {
    async request(method: string, params?: unknown): Promise<unknown> {
      const requestId = nextRequestId();
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: requestId,
        method,
        params
      };

      const responsePromise = new Promise<unknown>((resolve, reject) => {
        pendingRequests.set(requestId, {
          resolve,
          reject
        });
      });

      await options.sendMessage(`${JSON.stringify(request)}\n`);
      return responsePromise;
    },

    handleMessage(serializedMessage: string): void {
      const inboundMessage = JSON.parse(serializedMessage) as JsonRpcInboundMessage;

      if (!("id" in inboundMessage)) {
        return;
      }

      const pendingRequest = pendingRequests.get(inboundMessage.id);

      if (!pendingRequest) {
        return;
      }

      pendingRequests.delete(inboundMessage.id);

      if ("error" in inboundMessage) {
        pendingRequest.reject(
          new Error(
            `JSON-RPC ${inboundMessage.error.code}: ${inboundMessage.error.message}`
          )
        );
        return;
      }

      pendingRequest.resolve(inboundMessage.result);
    }
  };
}

let jsonRpcRequestSequence = 0;

function createDefaultRequestId(): number {
  jsonRpcRequestSequence += 1;
  return jsonRpcRequestSequence;
}
