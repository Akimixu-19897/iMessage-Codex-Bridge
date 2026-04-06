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

