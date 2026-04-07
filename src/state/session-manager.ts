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

    listContacts(): ResolvedContactSession[] {
      return [...state.contacts];
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
          threadId: null,
          lastActiveAt: null
        };
        state.contacts.push(contact);
        return contact;
      }

      const contact = state.contacts[contactIndex]!;
      contact.name = params.name;
      contact.workspace = params.workspace;
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
