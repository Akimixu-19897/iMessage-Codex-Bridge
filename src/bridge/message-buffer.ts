export type BufferedInboundMessage = {
  handle: string;
  messageId: string;
  text: string;
  attachments: string[];
  receivedAt: number;
};

export type FlushedMessageBatch = {
  handle: string;
  messageIds: string[];
  text: string;
  attachments: string[];
  lastReceivedAt: number;
};

type InternalBatch = FlushedMessageBatch;

export function createMessageBuffer(messageMergeWindowMs: number) {
  const batches = new Map<string, InternalBatch>();

  return {
    enqueue(message: BufferedInboundMessage): void {
      const existing = batches.get(message.handle);

      if (!existing) {
        batches.set(message.handle, {
          handle: message.handle,
          messageIds: [message.messageId],
          text: message.text,
          attachments: [...message.attachments],
          lastReceivedAt: message.receivedAt
        });
        return;
      }

      existing.messageIds.push(message.messageId);
      existing.text = [existing.text, message.text].filter(Boolean).join("\n");
      existing.attachments.push(...message.attachments);
      existing.lastReceivedAt = message.receivedAt;
    },

    flushReady(now: number): FlushedMessageBatch[] {
      const ready: FlushedMessageBatch[] = [];

      for (const [handle, batch] of batches) {
        if (now - batch.lastReceivedAt < messageMergeWindowMs) {
          continue;
        }

        ready.push({
          handle: batch.handle,
          messageIds: [...batch.messageIds],
          text: batch.text,
          attachments: [...batch.attachments],
          lastReceivedAt: batch.lastReceivedAt
        });
        batches.delete(handle);
      }

      return ready.sort((left, right) => left.lastReceivedAt - right.lastReceivedAt);
    }
  };
}
