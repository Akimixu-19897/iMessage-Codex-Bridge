export type ImsgRawAttachment = {
  path: string;
  mimeType?: string | null;
  original_path?: string | null;
  mime_type?: string | null;
};

export type ImsgRawMessage = {
  id?: string | number;
  guid?: string;
  chatId?: string;
  chat_id?: string | number;
  sender:
    | string
    | {
        handle: string;
        displayName?: string | null;
        display_name?: string | null;
      };
  text: string;
  timestamp?: number;
  created_at?: string | number | null;
  is_from_me?: boolean;
  isFromMe?: boolean;
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
  isFromMe: boolean;
};

export function normalizeImsgMessage(
  rawMessage: ImsgRawMessage
): NormalizedInboundMessage {
  const messageId = rawMessage.id ?? rawMessage.guid;
  const chatId = rawMessage.chatId ?? String(rawMessage.chat_id ?? "");
  const handle =
    typeof rawMessage.sender === "string"
      ? rawMessage.sender
      : rawMessage.sender.handle;
  const senderName =
    typeof rawMessage.sender === "string"
      ? null
      : (rawMessage.sender.displayName ?? rawMessage.sender.display_name ?? null);
  const receivedAt = rawMessage.timestamp ?? normalizeCreatedAt(rawMessage.created_at);

  return {
    messageId: normalizeRequiredString(messageId),
    chatId: normalizeRequiredString(chatId),
    handle: normalizeRequiredString(handle),
    senderName,
    text: rawMessage.text,
    receivedAt,
    attachmentPaths: rawMessage.attachments
      .map((attachment) => attachment.path ?? attachment.original_path ?? "")
      .filter((path) => path.length > 0),
    isFromMe: rawMessage.isFromMe ?? rawMessage.is_from_me ?? false
  };
}

function normalizeCreatedAt(value: ImsgRawMessage["created_at"]): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Date.parse(value);
  }

  return 0;
}

function normalizeRequiredString(value: string | number | undefined): string {
  if (value === undefined) {
    return "";
  }

  return String(value);
}
