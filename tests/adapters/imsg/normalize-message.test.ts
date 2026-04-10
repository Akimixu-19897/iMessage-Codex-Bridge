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
      attachmentPaths: [],
      isFromMe: false
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
      attachmentPaths: ["/tmp/image-a.png", "/tmp/image-b.jpg"],
      isFromMe: false
    });
  });

  test("normalizes real imsg json fields including self-message marker", () => {
    const normalized = normalizeImsgMessage({
      guid: "message-3",
      chat_id: 42,
      sender: {
        handle: "+8613900000000",
        display_name: "联系人 B"
      },
      text: "这是我发出的消息",
      created_at: "2026-04-07T07:00:00.000Z",
      is_from_me: true,
      attachments: [
        {
          original_path: "/tmp/camera-roll.png",
          mime_type: "image/png"
        }
      ]
    } as any);

    expect(normalized).toEqual({
      messageId: "message-3",
      chatId: "42",
      handle: "+8613900000000",
      senderName: "联系人 B",
      text: "这是我发出的消息",
      receivedAt: Date.parse("2026-04-07T07:00:00.000Z"),
      attachmentPaths: ["/tmp/camera-roll.png"],
      isFromMe: true
    });
  });

  test("normalizes real imsg watch events where sender is a plain string", () => {
    const normalized = normalizeImsgMessage({
      id: 8 as any,
      guid: "FAAC4CED-1610-4F76-960C-7BD8A2CC90AE",
      chat_id: 1,
      sender: "+8618352869601" as any,
      destination_caller_id: "1527829777@qq.com" as any,
      text: "111",
      created_at: "2026-04-07T11:10:23.321Z",
      is_from_me: false,
      attachments: []
    } as any);

    expect(normalized).toEqual({
      messageId: "8",
      chatId: "1",
      handle: "+8618352869601",
      senderName: null,
      text: "111",
      receivedAt: Date.parse("2026-04-07T11:10:23.321Z"),
      attachmentPaths: [],
      isFromMe: false
    });
  });
});
