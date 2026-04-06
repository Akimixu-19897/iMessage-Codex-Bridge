import { describe, expect, test } from "vitest";

import { createMessageBuffer } from "../../src/bridge/message-buffer.js";

describe("createMessageBuffer", () => {
  test("merges consecutive messages from the same contact within the time window", () => {
    const buffer = createMessageBuffer(5000);

    buffer.enqueue({
      handle: "+8613800000000",
      messageId: "m1",
      text: "第一句",
      attachments: [],
      receivedAt: 1000
    });

    buffer.enqueue({
      handle: "+8613800000000",
      messageId: "m2",
      text: "第二句",
      attachments: ["a.png"],
      receivedAt: 4000
    });

    const ready = buffer.flushReady(9000);

    expect(ready).toEqual([
      {
        handle: "+8613800000000",
        messageIds: ["m1", "m2"],
        text: "第一句\n第二句",
        attachments: ["a.png"],
        lastReceivedAt: 4000
      }
    ]);
  });

  test("keeps buffers isolated per contact", () => {
    const buffer = createMessageBuffer(5000);

    buffer.enqueue({
      handle: "+8613800000000",
      messageId: "m1",
      text: "A",
      attachments: [],
      receivedAt: 1000
    });

    buffer.enqueue({
      handle: "+8613900000000",
      messageId: "m2",
      text: "B",
      attachments: [],
      receivedAt: 1500
    });

    const ready = buffer.flushReady(7000);

    expect(ready).toEqual([
      {
        handle: "+8613800000000",
        messageIds: ["m1"],
        text: "A",
        attachments: [],
        lastReceivedAt: 1000
      },
      {
        handle: "+8613900000000",
        messageIds: ["m2"],
        text: "B",
        attachments: [],
        lastReceivedAt: 1500
      }
    ]);
  });
});
