import type { ParsedBridgeSessionCommand } from "./session-command.js";

type SessionManager = {
  createSession(params: { handle: string; name?: string; createdAt: number }): {
    handle: string;
    workspace: string;
    session: {
      id: string;
      name: string;
      workspace: string;
    };
    index: number;
  };
  listSessions(handle: string): Array<{
    id: string;
    name: string;
    workspace: string;
    threadId: string | null;
    lastActiveAt: number | null;
  }>;
  getCurrentSession(handle: string): {
    id: string;
    name: string;
    workspace: string;
    threadId: string | null;
  } | null;
  switchSession(
    handle: string,
    index: number
  ): {
    id: string;
    name: string;
    workspace: string;
    threadId: string | null;
  };
  getContact(handle: string): {
    currentSessionId: string | null;
    sessions: Array<{ id: string }>;
  };
};

type CreateSessionCommandExecutorOptions = {
  sessionManager: SessionManager;
  saveState: () => Promise<void>;
  now?: () => number;
};

export function createSessionCommandExecutor(
  options: CreateSessionCommandExecutorOptions
) {
  const now = options.now ?? Date.now;

  return {
    async execute(params: {
      handle: string;
      command: ParsedBridgeSessionCommand;
    }): Promise<string> {
      if (params.command.type === "invalid") {
        return params.command.message;
      }

      if (params.command.type === "new") {
        const created = options.sessionManager.createSession({
          handle: params.handle,
          name: params.command.name,
          createdAt: now()
        });
        await options.saveState();
        return `已创建并切换到会话 #${created.index}：${created.session.name}`;
      }

      if (params.command.type === "list") {
        return formatSessionList(
          options.sessionManager.getContact(params.handle).currentSessionId,
          options.sessionManager.listSessions(params.handle)
        );
      }

      if (params.command.type === "current") {
        const currentSession = options.sessionManager.getCurrentSession(params.handle);

        if (!currentSession) {
          return "当前没有活跃会话，请先发送 /new 或直接发送普通消息。";
        }

        const sessions = options.sessionManager.listSessions(params.handle);
        const index =
          sessions.findIndex((session) => session.id === currentSession.id) + 1;

        return `当前会话：#${index} ${currentSession.name}`;
      }

      const switchedSession = options.sessionManager.switchSession(
        params.handle,
        params.command.index
      );
      await options.saveState();
      return `已切换到会话 #${params.command.index}：${switchedSession.name}`;
    }
  };
}

function formatSessionList(
  currentSessionId: string | null,
  sessions: Array<{
    id: string;
    name: string;
    workspace: string;
    threadId: string | null;
    lastActiveAt: number | null;
  }>
): string {
  if (sessions.length === 0) {
    return "当前没有会话，请先发送 /new 或直接发送普通消息。";
  }

  const lines = sessions.map((session, index) => {
    const currentMarker = session.id === currentSessionId ? " *" : "";
    return `#${index + 1}${currentMarker} ${session.name} | thread=${session.threadId ?? "-"} | ${session.workspace}`;
  });

  return ["会话列表：", ...lines].join("\n");
}
