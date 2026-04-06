export type ImsgRawAttachment = {
  path: string;
  mimeType?: string | null;
};

export type ImsgRawMessage = {
  id: string;
  chatId: string;
  sender: {
    handle: string;
    displayName?: string | null;
  };
  text: string;
  timestamp: number;
  attachments: ImsgRawAttachment[];
};

export type NormalizedInboundMessage = {
  messageId: string;
  chatId: string;
  handle: string;
  senderName: string | null;
  text: string;
  receivedAt: number;
  attachmentPaths: string[];
};

export function normalizeImsgMessage(
  rawMessage: ImsgRawMessage
): NormalizedInboundMessage {
  return {
    messageId: rawMessage.id,
    chatId: rawMessage.chatId,
    handle: rawMessage.sender.handle,
    senderName: rawMessage.sender.displayName ?? null,
    text: rawMessage.text,
    receivedAt: rawMessage.timestamp,
    attachmentPaths: rawMessage.attachments.map((attachment) => attachment.path)
  };
}
