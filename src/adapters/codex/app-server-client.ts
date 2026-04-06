export type CodexThread = {
  id: string;
  cwd: string;
  updatedAt?: number;
};

export type CodexTurn = {
  id: string;
  status: string;
};

export type ThreadStartParams = {
  cwd: string;
  experimentalRawEvents?: boolean;
  persistExtendedHistory?: boolean;
};

export type ThreadResumeParams = {
  threadId: string;
  cwd?: string;
  persistExtendedHistory?: boolean;
};

export type CodexAppServerClient = {
  startThread(params: ThreadStartParams): Promise<CodexThread>;
  resumeThread(params: ThreadResumeParams): Promise<CodexThread>;
  startTurn(params: TurnStartParams): Promise<CodexTurn>;
};

export type TurnInputItem = {
  type: "text";
  text: string;
  text_elements?: unknown[];
};

export type TurnStartParams = {
  threadId: string;
  input: TurnInputItem[];
  cwd?: string;
};

export type AppServerRequest =
  | {
      id: number;
      method: "thread/start";
      params: {
        cwd: string;
        experimentalRawEvents: boolean;
        persistExtendedHistory: boolean;
      };
    }
  | {
      id: number;
      method: "thread/resume";
      params: {
        threadId: string;
        cwd?: string;
        persistExtendedHistory: boolean;
      };
    }
  | {
      id: number;
      method: "turn/start";
      params: {
        threadId: string;
        input: {
          type: "text";
          text: string;
          text_elements: unknown[];
        }[];
        cwd?: string;
      };
    };

type AppServerThreadEnvelope = {
  thread: CodexThread;
};

type AppServerTurnEnvelope = {
  turn: CodexTurn;
};

export type AppServerRequestInvoker = (
  request: AppServerRequest
) => Promise<AppServerThreadEnvelope | AppServerTurnEnvelope>;

type CreateCodexAppServerClientOptions = {
  invokeRequest: AppServerRequestInvoker;
  nextRequestId?: () => number;
};

export function createCodexAppServerClient(
  options: CreateCodexAppServerClientOptions
): CodexAppServerClient {
  const nextRequestId = options.nextRequestId ?? defaultNextRequestId;

  return {
    async startThread(params: ThreadStartParams): Promise<CodexThread> {
      const response = await options.invokeRequest({
        id: nextRequestId(),
        method: "thread/start",
        params: {
          cwd: params.cwd,
          experimentalRawEvents: params.experimentalRawEvents ?? false,
          persistExtendedHistory: params.persistExtendedHistory ?? true
        }
      });

      return expectThreadEnvelope(response).thread;
    },

    async resumeThread(params: ThreadResumeParams): Promise<CodexThread> {
      const response = await options.invokeRequest({
        id: nextRequestId(),
        method: "thread/resume",
        params: {
          threadId: params.threadId,
          cwd: params.cwd,
          persistExtendedHistory: params.persistExtendedHistory ?? true
        }
      });

      return expectThreadEnvelope(response).thread;
    },

    async startTurn(params: TurnStartParams): Promise<CodexTurn> {
      const response = await options.invokeRequest({
        id: nextRequestId(),
        method: "turn/start",
        params: {
          threadId: params.threadId,
          input: params.input.map((item) => ({
            type: "text" as const,
            text: item.text,
            text_elements: item.text_elements ?? []
          })),
          cwd: params.cwd
        }
      });

      return expectTurnEnvelope(response).turn;
    }
  };
}

let requestSequence = 0;

function defaultNextRequestId(): number {
  requestSequence += 1;
  return requestSequence;
}

function expectThreadEnvelope(
  response: AppServerThreadEnvelope | AppServerTurnEnvelope
): AppServerThreadEnvelope {
  if (!("thread" in response)) {
    throw new Error("app-server 返回了意外的响应类型，期望 thread");
  }

  return response;
}

function expectTurnEnvelope(
  response: AppServerThreadEnvelope | AppServerTurnEnvelope
): AppServerTurnEnvelope {
  if (!("turn" in response)) {
    throw new Error("app-server 返回了意外的响应类型，期望 turn");
  }

  return response;
}
