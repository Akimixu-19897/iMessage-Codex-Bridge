import { describe, expect, test } from "vitest";

import { normalizeImsgMessage } from "../../../src/adapters/imsg/normalize-message.js";

describe("normalizeImsgMessage", () => {
  test("normalizes a text-only imsg event", () => {
    const normalized = normalizeImsgMessage({
      id: "message-1",
      chatId: "chat-1",
      sender: {
        handle: "+8613800000000",
        displayName: "测试联系人"
      },
      text: "你好，Codex",
      timestamp: 1710000000,
      attachments: []
    });

    expect(normalized).toEqual({
      messageId: "message-1",
      chatId: "chat-1",
      handle: "+8613800000000",
      senderName: "测试联系人",
      text: "你好，Codex",
      receivedAt: 1710000000,
      attachmentPaths: []
    });
  });

  test("extracts local attachment paths from image attachments", () => {
    const normalized = normalizeImsgMessage({
      id: "message-2",
      chatId: "chat-2",
      sender: {
        handle: "+8613900000000"
      },
      text: "帮我看看这张图",
      timestamp: 1710000001,
      attachments: [
        {
          path: "/tmp/image-a.png",
          mimeType: "image/png"
        },
        {
          path: "/tmp/image-b.jpg",
          mimeType: "image/jpeg"
        }
      ]
    });

    expect(normalized).toEqual({
      messageId: "message-2",
      chatId: "chat-2",
      handle: "+8613900000000",
      senderName: null,
      text: "帮我看看这张图",
      receivedAt: 1710000001,
      attachmentPaths: ["/tmp/image-a.png", "/tmp/image-b.jpg"]
    });
  });
});
