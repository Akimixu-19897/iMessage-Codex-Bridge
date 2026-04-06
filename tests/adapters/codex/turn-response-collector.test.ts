import { describe, expect, test } from "vitest";

import { createTurnResponseCollector } from "../../../src/adapters/codex/turn-response-collector.js";

describe("createTurnResponseCollector", () => {
  test("aggregates agent message deltas until the turn completes", async () => {
    const collector = createTurnResponseCollector();
    const resultPromise = collector.waitForTurn({
      threadId: "thread-1",
      turnId: "turn-1"
    });

    collector.handleNotification({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "你好"
      }
    });
    collector.handleNotification({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "，Codex"
      }
    });
    collector.handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed"
        }
      }
    });

    await expect(resultPromise).resolves.toEqual({
      threadId: "thread-1",
      turnId: "turn-1",
      status: "completed",
      text: "你好，Codex"
    });
  });

  test("ignores notifications for unrelated turns", async () => {
    const collector = createTurnResponseCollector();
    const resultPromise = collector.waitForTurn({
      threadId: "thread-1",
      turnId: "turn-1"
    });

    collector.handleNotification({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-x",
        itemId: "item-x",
        delta: "ignored"
      }
    });
    collector.handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed"
        }
      }
    });

    await expect(resultPromise).resolves.toEqual({
      threadId: "thread-1",
      turnId: "turn-1",
      status: "completed",
      text: ""
    });
  });

  test("replays buffered notifications that arrived before waitForTurn", async () => {
    const collector = createTurnResponseCollector();

    collector.handleNotification({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "先到的内容"
      }
    });
    collector.handleNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed"
        }
      }
    });

    await expect(
      collector.waitForTurn({
        threadId: "thread-1",
        turnId: "turn-1"
      })
    ).resolves.toEqual({
      threadId: "thread-1",
      turnId: "turn-1",
      status: "completed",
      text: "先到的内容"
    });
  });
});
