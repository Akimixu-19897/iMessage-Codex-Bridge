import { describe, expect, test } from "vitest";

import { createImsgJsonStreamParser } from "../../../src/adapters/imsg/imsg-json-stream.js";

describe("createImsgJsonStreamParser", () => {
  test("parses newline-delimited messages across chunk boundaries", () => {
    const messages: unknown[] = [];
    const parser = createImsgJsonStreamParser({
      onMessage: (message) => {
        messages.push(message);
      }
    });

    parser.pushChunk(
      '{"id":"m1","chatId":"c1","sender":{"handle":"+8613800000000"},"text":"第一条","timestamp":1,"attachments":[]}\n{"id":"m2"'
    );
    parser.pushChunk(
      ',"chatId":"c1","sender":{"handle":"+8613800000000","displayName":"测试联系人"},"text":"第二条","timestamp":2,"attachments":[{"path":"/tmp/a.png"}]}\n'
    );

    expect(messages).toEqual([
      {
        messageId: "m1",
        chatId: "c1",
        handle: "+8613800000000",
        senderName: null,
        text: "第一条",
        receivedAt: 1,
        attachmentPaths: []
      },
      {
        messageId: "m2",
        chatId: "c1",
        handle: "+8613800000000",
        senderName: "测试联系人",
        text: "第二条",
        receivedAt: 2,
        attachmentPaths: ["/tmp/a.png"]
      }
    ]);
  });

  test("ignores empty lines in the stream", () => {
    const messages: unknown[] = [];
    const parser = createImsgJsonStreamParser({
      onMessage: (message) => {
        messages.push(message);
      }
    });

    parser.pushChunk('\n{"id":"m1","chatId":"c1","sender":{"handle":"+8613800000000"},"text":"唯一消息","timestamp":1,"attachments":[]}\n\n');

    expect(messages).toEqual([
      {
        messageId: "m1",
        chatId: "c1",
        handle: "+8613800000000",
        senderName: null,
        text: "唯一消息",
        receivedAt: 1,
        attachmentPaths: []
      }
    ]);
  });
});
