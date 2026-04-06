import {
  normalizeImsgMessage,
  type ImsgRawMessage,
  type NormalizedInboundMessage
} from "./normalize-message.js";

type CreateImsgJsonStreamParserOptions = {
  onMessage: (message: NormalizedInboundMessage) => void;
};

export function createImsgJsonStreamParser(
  options: CreateImsgJsonStreamParserOptions
) {
  let buffer = "";

  return {
    pushChunk(chunk: string): void {
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (!trimmedLine) {
          continue;
        }

        const rawMessage = JSON.parse(trimmedLine) as ImsgRawMessage;
        options.onMessage(normalizeImsgMessage(rawMessage));
      }
    }
  };
}
