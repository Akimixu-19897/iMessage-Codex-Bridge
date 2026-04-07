import type { NormalizedInboundMessage } from "../adapters/imsg/normalize-message.js";
import type { BridgeConfig } from "../config/schema.js";
import { createContactPolicy } from "./contact-policy.js";
import { createMessageBuffer } from "./message-buffer.js";
import {
  parseBridgeAdminCommand,
  type ParsedBridgeAdminCommand
} from "./admin-command.js";

type RejectedAction = {
  type: "reject";
  handle: string;
  message: string;
};

type AcceptedAction = {
  type: "accepted";
  handle: string;
};

type CommandAction = {
  type: "command";
  handle: string;
  command: ParsedBridgeAdminCommand;
};

type IgnoredAction = {
  type: "ignored";
  reason: "duplicate" | "self";
  handle: string;
  messageId: string;
};

export type HandleIncomingMessageResult =
  | RejectedAction
  | AcceptedAction
  | CommandAction
  | IgnoredAction;

type CreateBridgeServiceOptions = {
  contactsProvider?: () => BridgeConfig["contacts"];
  adminHandles?: string[];
};

export function createBridgeService(
  config: BridgeConfig,
  options: CreateBridgeServiceOptions = {}
) {
  const messageBuffer = createMessageBuffer(config.messageMergeWindowMs);
  const seenMessageIds = new Map<string, number>();
  const adminHandles = new Set(
    options.adminHandles && options.adminHandles.length > 0
      ? options.adminHandles
      : config.adminHandles && config.adminHandles.length > 0
        ? config.adminHandles
        : config.contacts.map((contact) => contact.handle)
  );

  function createDynamicContactPolicy() {
    return createContactPolicy({
      ...config,
      contacts: options.contactsProvider?.() ?? config.contacts
    });
  }

  function pruneSeenMessageIds(now: number): void {
    const retentionWindowMs = config.messageMergeWindowMs * 20;

    for (const [messageId, receivedAt] of seenMessageIds.entries()) {
      if (now - receivedAt > retentionWindowMs) {
        seenMessageIds.delete(messageId);
      }
    }
  }

  return {
    buildWatchArgs(): string[] {
      return ["watch", "--json", "--attachments"];
    },

    handleIncomingMessage(
      message: NormalizedInboundMessage
    ): HandleIncomingMessageResult {
      pruneSeenMessageIds(message.receivedAt);

      if (message.isFromMe) {
        return {
          type: "ignored",
          reason: "self",
          handle: message.handle,
          messageId: message.messageId
        };
      }

      if (seenMessageIds.has(message.messageId)) {
        return {
          type: "ignored",
          reason: "duplicate",
          handle: message.handle,
          messageId: message.messageId
        };
      }

      seenMessageIds.set(message.messageId, message.receivedAt);
      const parsedAdminCommand =
        adminHandles.has(message.handle) && message.text
          ? parseBridgeAdminCommand(message.text)
          : null;

      if (parsedAdminCommand) {
        return {
          type: "command",
          handle: message.handle,
          command: parsedAdminCommand
        };
      }

      const decision = createDynamicContactPolicy().evaluate(message.handle);

      if (!decision.allowed) {
        return {
          type: "reject",
          handle: message.handle,
          message: decision.rejectionMessage
        };
      }

      messageBuffer.enqueue({
        handle: message.handle,
        messageId: message.messageId,
        text: message.text,
        attachments: message.attachmentPaths,
        receivedAt: message.receivedAt
      });

      return {
        type: "accepted",
        handle: message.handle
      };
    },

    flushReady(now: number) {
      pruneSeenMessageIds(now);
      return messageBuffer.flushReady(now);
    }
  };
}
