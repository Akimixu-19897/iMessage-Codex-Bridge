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

export type HandleIncomingMessageResult = RejectedAction | AcceptedAction;

export function createBridgeService(config: BridgeConfig) {
  const contactPolicy = createContactPolicy(config);
  const messageBuffer = createMessageBuffer(config.messageMergeWindowMs);

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
      return messageBuffer.flushReady(now);
    }
  };
}
