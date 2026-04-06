export type CodexThread = {
  id: string;
  cwd: string;
  updatedAt?: number;
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
    };

type AppServerThreadEnvelope = {
  thread: CodexThread;
};

export type AppServerRequestInvoker = (
  request: AppServerRequest
) => Promise<AppServerThreadEnvelope>;

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

      return response.thread;
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

      return response.thread;
    }
  };
}

let requestSequence = 0;

function defaultNextRequestId(): number {
  requestSequence += 1;
  return requestSequence;
}
