import type { ResolvedContactSession } from "../../state/session-manager.js";

import type {
  CodexAppServerClient,
  CodexThread
} from "./app-server-client.js";

type SessionManager = {
  getSession(handle: string): ResolvedContactSession;
  bindThread(params: {
    handle: string;
    threadId: string;
    activatedAt: number;
  }): ResolvedContactSession;
  touchSession(params: {
    handle: string;
    activatedAt: number;
  }): ResolvedContactSession;
};

type CreateThreadServiceOptions = {
  appServerClient: CodexAppServerClient;
  sessionManager: SessionManager;
  saveState?: () => Promise<void>;
  now?: () => number;
};

export type ResolvedCodexThread = {
  handle: string;
  workspace: string;
  threadId: string;
  created: boolean;
  thread: CodexThread;
};

export function createThreadService(options: CreateThreadServiceOptions) {
  const now = options.now ?? Date.now;
  const saveState = options.saveState ?? (async () => {});

  return {
    async ensureThread(handle: string): Promise<ResolvedCodexThread> {
      const session = options.sessionManager.getSession(handle);
      const activatedAt = now();

      if (session.threadId) {
        const thread = await options.appServerClient.resumeThread({
          threadId: session.threadId,
          cwd: session.workspace,
          persistExtendedHistory: true
        });

        options.sessionManager.touchSession({
          handle,
          activatedAt
        });
        await saveState();

        return {
          handle,
          workspace: session.workspace,
          threadId: thread.id,
          created: false,
          thread
        };
      }

      const thread = await options.appServerClient.startThread({
        cwd: session.workspace,
        experimentalRawEvents: false,
        persistExtendedHistory: true
      });

      options.sessionManager.bindThread({
        handle,
        threadId: thread.id,
        activatedAt
      });
      await saveState();

      return {
        handle,
        workspace: session.workspace,
        threadId: thread.id,
        created: true,
        thread
      };
    }
  };
}

