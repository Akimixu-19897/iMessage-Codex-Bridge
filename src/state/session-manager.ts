import type { BridgeState, ContactSessionState } from "./state-store.js";

export type ResolvedContactSession = ContactSessionState;
export type ResolvedConversationSession = ContactSessionState["sessions"][number];

type BindThreadParams = {
  handle: string;
  sessionId: string;
  threadId: string;
  activatedAt: number;
};

type TouchSessionParams = {
  handle: string;
  sessionId: string;
  activatedAt: number;
};

export function createSessionManager(state: BridgeState) {
  function findContactIndex(handle: string): number {
    return state.contacts.findIndex((contact) => contact.handle === handle);
  }

  function getContactOrThrow(handle: string): ContactSessionState {
    const contactIndex = findContactIndex(handle);

    if (contactIndex === -1) {
      throw new Error(`未找到联系人会话映射: ${handle}`);
    }

    return state.contacts[contactIndex]!;
  }

  return {
    getContact(handle: string): ResolvedContactSession {
      return getContactOrThrow(handle);
    },

    listContacts(): ResolvedContactSession[] {
      return [...state.contacts];
    },

    getCurrentSession(handle: string): ResolvedConversationSession | null {
      const contact = getContactOrThrow(handle);

      if (!contact.currentSessionId) {
        return null;
      }

      return (
        contact.sessions.find((session) => session.id === contact.currentSessionId) ??
        null
      );
    },

    ensureCurrentSession(handle: string, activatedAt: number): ResolvedConversationSession {
      const existingSession = this.getCurrentSession(handle);

      if (existingSession) {
        return existingSession;
      }

      return this.createSession({
        handle,
        name: "默认会话",
        createdAt: activatedAt
      }).session;
    },

    listSessions(handle: string): ResolvedConversationSession[] {
      return [...getContactOrThrow(handle).sessions];
    },

    createSession(params: {
      handle: string;
      name?: string;
      createdAt: number;
    }): {
      handle: string;
      workspace: string;
      session: ResolvedConversationSession;
      index: number;
    } {
      const contact = getContactOrThrow(params.handle);
      const sessionIndex = contact.sessions.length + 1;
      const session: ResolvedConversationSession = {
        id: `session-${sessionIndex}`,
        name: params.name?.trim() || `新会话 ${sessionIndex}`,
        workspace: contact.workspace,
        threadId: null,
        createdAt: params.createdAt,
        lastActiveAt: params.createdAt
      };
      contact.sessions.push(session);
      contact.currentSessionId = session.id;

      return {
        handle: params.handle,
        workspace: contact.workspace,
        session,
        index: sessionIndex
      };
    },

    switchSession(handle: string, index: number): ResolvedConversationSession {
      const contact = getContactOrThrow(handle);
      const session = contact.sessions[index - 1];

      if (!session) {
        throw new Error(`未找到会话 #${index}`);
      }

      contact.currentSessionId = session.id;
      return session;
    },

    bindThread(params: BindThreadParams): ResolvedConversationSession {
      const contact = getContactOrThrow(params.handle);
      const session =
        contact.sessions.find((item) => item.id === params.sessionId) ??
        this.ensureCurrentSession(params.handle, params.activatedAt);
      session.threadId = params.threadId;
      session.lastActiveAt = params.activatedAt;
      contact.currentSessionId = session.id;
      return session;
    },

    touchSession(params: TouchSessionParams): ResolvedConversationSession {
      const contact = getContactOrThrow(params.handle);
      const session =
        contact.sessions.find((item) => item.id === params.sessionId) ??
        this.ensureCurrentSession(params.handle, params.activatedAt);
      session.lastActiveAt = params.activatedAt;
      contact.currentSessionId = session.id;
      return session;
    },

    upsertContact(params: {
      handle: string;
      name: string;
      workspace: string;
    }): ResolvedContactSession {
      const contactIndex = findContactIndex(params.handle);

      if (contactIndex === -1) {
        const contact: ContactSessionState = {
          handle: params.handle,
          name: params.name,
          workspace: params.workspace,
          currentSessionId: null,
          sessions: []
        };
        state.contacts.push(contact);
        return contact;
      }

      const contact = state.contacts[contactIndex]!;
      contact.name = params.name;
      contact.workspace = params.workspace;
      for (const session of contact.sessions) {
        session.workspace = params.workspace;
        session.threadId = null;
      }
      return contact;
    },

    updateWorkspace(params: {
      handle: string;
      workspace: string;
    }): ResolvedContactSession {
      const contact = getContactOrThrow(params.handle);
      contact.workspace = params.workspace;

      if (contact.currentSessionId) {
        const currentSession = contact.sessions.find(
          (session) => session.id === contact.currentSessionId
        );

        if (currentSession) {
          currentSession.workspace = params.workspace;
          currentSession.threadId = null;
        }
      }

      return contact;
    },

    removeContact(handle: string): ResolvedContactSession {
      const contactIndex = findContactIndex(handle);

      if (contactIndex === -1) {
        throw new Error(`未找到联系人会话映射: ${handle}`);
      }

      return state.contacts.splice(contactIndex, 1)[0]!;
    }
  };
}
