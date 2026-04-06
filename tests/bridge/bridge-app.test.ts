import { describe, expect, test } from "vitest";

import { createBridgeApp } from "../../src/bridge/bridge-app.js";
import type { BridgeRuntimeAction } from "../../src/bridge/bridge-runtime.js";

describe("createBridgeApp", () => {
  test("exposes watch arguments from bridge runtime", () => {
    const app = createBridgeApp({
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

    expect(app.watchArgs).toEqual([
      "watch",
      "--json",
      "--attachments",
      "--participants",
      "+8613800000000"
    ]);
  });

  test("processes imsg chunks and drains runtime actions", () => {
    const app = createBridgeApp({
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

    app.processImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613900000000"},"text":"你好","timestamp":1000,"attachments":[]}\n'
    );
    app.processImsgChunk(
      '{"id":"m2","chatId":"chat-1","sender":{"handle":"+8613800000000"},"text":"第一句","timestamp":2000,"attachments":[]}\n'
    );
    app.processImsgChunk(
      '{"id":"m3","chatId":"chat-1","sender":{"handle":"+8613800000000"},"text":"第二句","timestamp":2500,"attachments":[{"path":"/tmp/a.png"}]}\n'
    );

    expect(app.drainActions(8000)).toEqual([
      {
        type: "reject",
        handle: "+8613900000000",
        message: "请联系管理员开通权限。"
      },
      {
        type: "submit",
        batch: {
          handle: "+8613800000000",
          messageIds: ["m2", "m3"],
          text: "第一句\n第二句",
          attachments: ["/tmp/a.png"],
          lastReceivedAt: 2500
        }
      }
    ]);
  });

  test("executes ready runtime actions through the codex executor hook", async () => {
    const executeRuntimeActions = async (actions: BridgeRuntimeAction[]) =>
      actions.map((action) =>
        action.type === "reject"
          ? action
          : {
              type: "reply" as const,
              handle: action.batch.handle,
              message: "这是 Codex 的回复",
              threadId: "thread-1",
              turnId: "turn-1"
            }
      );
    const app = createBridgeApp(
      {
        rejectionMessage: "请联系管理员开通权限。",
        messageMergeWindowMs: 5000,
        contacts: [
          {
            handle: "+8613800000000",
            name: "联系人 A",
            workspace: "/tmp/workspace-a"
          }
        ]
      },
      {
        executeRuntimeActions
      }
    );

    app.processImsgChunk(
      '{"id":"m1","chatId":"chat-1","sender":{"handle":"+8613800000000"},"text":"你好","timestamp":1000,"attachments":[]}\n'
    );

    await expect(app.executeReadyActions(7000)).resolves.toEqual([
      {
        type: "reply",
        handle: "+8613800000000",
        message: "这是 Codex 的回复",
        threadId: "thread-1",
        turnId: "turn-1"
      }
    ]);
  });
});
