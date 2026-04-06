import { describe, expect, test } from "vitest";

import { createBridgeService } from "../../src/bridge/bridge-service.js";

describe("createBridgeService", () => {
  test("builds watch arguments from whitelisted contacts", () => {
    const service = createBridgeService({
      rejectionMessage: "请联系管理员开通权限。",
      messageMergeWindowMs: 5000,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a"
        },
        {
          handle: "+8613900000000",
          name: "联系人 B",
          workspace: "/tmp/workspace-b"
        }
      ]
    });

    expect(service.buildWatchArgs()).toEqual([
      "watch",
      "--json",
      "--attachments",
      "--participants",
      "+8613800000000,+8613900000000"
    ]);
  });

  test("returns rejection action for non-whitelisted contacts", () => {
    const service = createBridgeService({
      rejectionMessage: "请联系管理员开通权限。",
      messageMergeWindowMs: 5000,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a"
        }
      ]
    });

    const result = service.handleIncomingMessage({
      messageId: "m1",
      chatId: "chat-1",
      handle: "+8613900000000",
      senderName: "陌生人",
      text: "你好",
      receivedAt: 1,
      attachmentPaths: []
    });

    expect(result).toEqual({
      type: "reject",
      handle: "+8613900000000",
      message: "请联系管理员开通权限。"
    });
  });

  test("buffers whitelisted messages and flushes merged batches", () => {
    const service = createBridgeService({
      rejectionMessage: "请联系管理员开通权限。",
      messageMergeWindowMs: 5000,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a"
        }
      ]
    });

    expect(
      service.handleIncomingMessage({
        messageId: "m1",
        chatId: "chat-1",
        handle: "+8613800000000",
        senderName: "联系人 A",
        text: "第一句",
        receivedAt: 1000,
        attachmentPaths: []
      })
    ).toEqual({
      type: "accepted",
      handle: "+8613800000000"
    });

    expect(
      service.handleIncomingMessage({
        messageId: "m2",
        chatId: "chat-1",
        handle: "+8613800000000",
        senderName: "联系人 A",
        text: "第二句",
        receivedAt: 2000,
        attachmentPaths: ["/tmp/a.png"]
      })
    ).toEqual({
      type: "accepted",
      handle: "+8613800000000"
    });

    expect(service.flushReady(8000)).toEqual([
      {
        handle: "+8613800000000",
        messageIds: ["m1", "m2"],
        text: "第一句\n第二句",
        attachments: ["/tmp/a.png"],
        lastReceivedAt: 2000
      }
    ]);
  });
});
