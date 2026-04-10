import type {
  ResolvedContactSession,
  ResolvedConversationSession
} from "../../state/session-manager.js";

import type {
  CodexAppServerClient,
  CodexThread
} from "./app-server-client.js";

type SessionManager = {
  ensureCurrentSession(
    handle: string,
    activatedAt: number
  ): ResolvedConversationSession;
  bindThread(params: {
    handle: string;
    sessionId: string;
    threadId: string;
    activatedAt: number;
  }): ResolvedConversationSession;
  touchSession(params: {
    handle: string;
    sessionId: string;
    activatedAt: number;
  }): ResolvedConversationSession;
};

type CreateThreadServiceOptions = {
  appServerClient: CodexAppServerClient;
  sessionManager: SessionManager;
  resolveThreadPolicy?: (params: {
    handle: string;
    workspace: string;
  }) => {
    approvalPolicy: "untrusted" | "on-failure" | "on-request" | "never";
    sandbox: "read-only" | "workspace-write" | "danger-full-access";
    developerInstructions: string;
  };
  saveState?: () => Promise<void>;
  now?: () => number;
};

export type ResolvedCodexThread = {
  handle: string;
  sessionId: string;
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
      const activatedAt = now();
      const contact = options.sessionManager.ensureCurrentSession(handle, activatedAt);
      const threadPolicy = options.resolveThreadPolicy?.({
        handle,
        workspace: contact.workspace
      });

      if (contact.threadId) {
        const thread = await options.appServerClient.resumeThread({
          threadId: contact.threadId,
          cwd: contact.workspace,
          persistExtendedHistory: true,
          approvalPolicy: threadPolicy?.approvalPolicy,
          sandbox: threadPolicy?.sandbox,
          developerInstructions: threadPolicy?.developerInstructions
        });

        options.sessionManager.touchSession({
          handle,
          sessionId: contact.id,
          activatedAt
        });
        await saveState();

        return {
          handle,
          sessionId: contact.id,
          workspace: contact.workspace,
          threadId: thread.id,
          created: false,
          thread
        };
      }

      const thread = await options.appServerClient.startThread({
        cwd: contact.workspace,
        experimentalRawEvents: false,
        persistExtendedHistory: true,
        approvalPolicy: threadPolicy?.approvalPolicy,
        sandbox: threadPolicy?.sandbox,
        developerInstructions: threadPolicy?.developerInstructions
      });

      options.sessionManager.bindThread({
        handle,
        sessionId: contact.id,
        threadId: thread.id,
        activatedAt
      });
      await saveState();

      return {
        handle,
        sessionId: contact.id,
        workspace: contact.workspace,
        threadId: thread.id,
        created: true,
        thread
      };
    }
  };
}
