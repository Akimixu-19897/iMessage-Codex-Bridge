import type { NormalizedInboundMessage } from "../adapters/imsg/normalize-message.js";
import type { BridgeConfig } from "../config/schema.js";
import { createContactPolicy } from "./contact-policy.js";
import { createMessageBuffer } from "./message-buffer.js";

type RejectedAction = {
  type: "reject";
  handle: string;
  message: string;
};

type AcceptedAction = {
  type: "accepted";
  handle: string;
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
  | IgnoredAction;

export function createBridgeService(config: BridgeConfig) {
  const contactPolicy = createContactPolicy(config);
  const messageBuffer = createMessageBuffer(config.messageMergeWindowMs);
  const seenMessageIds = new Map<string, number>();

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
      return [
        "watch",
        "--json",
        "--attachments",
        "--participants",
        config.contacts.map((contact) => contact.handle).join(",")
      ];
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
      const decision = contactPolicy.evaluate(message.handle);

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
