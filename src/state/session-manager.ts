import type { BridgeState, ContactSessionState } from "./state-store.js";

export type ResolvedContactSession = ContactSessionState;

type BindThreadParams = {
  handle: string;
  threadId: string;
  activatedAt: number;
};

type TouchSessionParams = {
  handle: string;
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
    getSession(handle: string): ResolvedContactSession {
      return getContactOrThrow(handle);
    },

    bindThread(params: BindThreadParams): ResolvedContactSession {
      const contact = getContactOrThrow(params.handle);
      contact.threadId = params.threadId;
      contact.lastActiveAt = params.activatedAt;
      return contact;
    },

    touchSession(params: TouchSessionParams): ResolvedContactSession {
      const contact = getContactOrThrow(params.handle);
      contact.lastActiveAt = params.activatedAt;
      return contact;
    }
  };
}
