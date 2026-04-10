import { describe, expect, test } from "vitest";

import { createBridgeRuntime } from "../../src/bridge/bridge-runtime.js";

describe("createBridgeRuntime", () => {
  test("emits rejection actions for non-whitelisted inbound messages", () => {
    const runtime = createBridgeRuntime({
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

    runtime.pushImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613900000000","displayName":"陌生人"},"text":"你好","timestamp":1000,"attachments":[]}\n'
    );

    expect(runtime.watchArgs).toEqual(["watch", "--json", "--attachments"]);
    expect(runtime.drainActions(1000)).toEqual([
      {
        type: "reject",
        handle: "+8613900000000",
        message: "请联系管理员开通权限。"
      }
    ]);
  });

  test("emits flushed batches for whitelisted messages after the merge window", () => {
    const runtime = createBridgeRuntime({
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

    runtime.pushImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000","displayName":"联系人 A"},"text":"第一句","timestamp":1000,"attachments":[]}\n'
    );
    runtime.pushImsgChunk(
      '{"id":"m2","chatId":"chat-1","sender":{"handle":"+8613800000000","displayName":"联系人 A"},"text":"第二句","timestamp":2000,"attachments":[{"path":"/tmp/a.png"}]}\n'
    );

    expect(runtime.drainActions(8000)).toEqual([
      {
        type: "submit",
        batch: {
          handle: "+8613800000000",
          messageIds: ["m1", "m2"],
          text: "第一句\n第二句",
          attachments: ["/tmp/a.png"],
          lastReceivedAt: 2000,
          background: false
        }
      }
    ]);
  });

  test("ignores duplicate imsg message ids when draining actions", () => {
    const runtime = createBridgeRuntime({
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

    runtime.pushImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000","displayName":"联系人 A"},"text":"第一句","timestamp":1000,"attachments":[]}\n'
    );
    runtime.pushImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000","displayName":"联系人 A"},"text":"第一句（重复）","timestamp":1200,"attachments":[{"path":"/tmp/duplicate.png"}]}\n'
    );

    expect(runtime.drainActions(7000)).toEqual([
      {
        type: "submit",
        batch: {
          handle: "+8613800000000",
          messageIds: ["m1"],
          text: "第一句",
          attachments: [],
          lastReceivedAt: 1000,
          background: false
        }
      }
    ]);
  });

  test("emits admin command actions before whitelist checks", () => {
    const runtime = createBridgeRuntime({
      rejectionMessage: "请联系管理员开通权限。",
      messageMergeWindowMs: 5000,
      contacts: [
        {
          handle: "+8613800000000",
          name: "联系人 A",
          workspace: "/tmp/workspace-a"
        }
      ],
      adminHandles: ["+8613700000000"]
    });

    runtime.pushImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613700000000","displayName":"管理员"},"text":"/bridge list","timestamp":1000,"attachments":[]}\n'
    );

    expect(runtime.drainActions(1000)).toEqual([
      {
        type: "command",
        handle: "+8613700000000",
        command: {
          type: "list"
        }
      }
    ]);
  });

  test("emits session command actions for whitelisted contacts", () => {
    const runtime = createBridgeRuntime({
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

    runtime.pushImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000","displayName":"联系人 A"},"text":"/new 重构支付","timestamp":1000,"attachments":[]}\n'
    );

    expect(runtime.drainActions(1000)).toEqual([
      {
        type: "session_command",
        handle: "+8613800000000",
        command: {
          type: "new",
          name: "重构支付"
        }
      }
    ]);
  });

  test("flushes buffered message before session command to avoid cross-session delivery", () => {
    const runtime = createBridgeRuntime({
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

    runtime.pushImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000","displayName":"联系人 A"},"text":"旧会话里的最后一条","timestamp":1000,"attachments":[]}\n'
    );
    runtime.pushImsgChunk(
      '{"id":"m2","chatId":"chat-1","sender":{"handle":"+8613800000000","displayName":"联系人 A"},"text":"/new 新会话","timestamp":1200,"attachments":[]}\n'
    );

    expect(runtime.drainActions(7000)).toEqual([
      {
        type: "submit",
        batch: {
          handle: "+8613800000000",
          messageIds: ["m1"],
          text: "旧会话里的最后一条",
          attachments: [],
          lastReceivedAt: 1000,
          background: false
        }
      },
      {
        type: "session_command",
        handle: "+8613800000000",
        command: {
          type: "new",
          name: "新会话"
        }
      }
    ]);
  });
});
