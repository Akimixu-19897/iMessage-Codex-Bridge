import { describe, expect, test, vi } from "vitest";

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

  test("forwards delta callbacks while accumulating text", async () => {
    const collector = createTurnResponseCollector();
    const seenTexts: string[] = [];
    const resultPromise = collector.waitForTurn({
      threadId: "thread-1",
      turnId: "turn-1",
      onDelta: ({ text }) => {
        seenTexts.push(text);
      }
    });

    collector.handleNotification({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "第一段"
      }
    });
    collector.handleNotification({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        delta: "第二段"
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
      text: "第一段第二段"
    });
    expect(seenTexts).toEqual(["第一段", "第一段第二段"]);
  });

  test("clears pending turn state after cancellation so late notifications are ignored", async () => {
    vi.useFakeTimers();
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
        delta: "不会保留"
      }
    });

    collector.cancelTurn("turn-1");
    await expect(resultPromise).rejects.toThrow("turn cancelled");

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

    const replayedPromise = collector.waitForTurn({
      threadId: "thread-1",
      turnId: "turn-1"
    });
    const replayTimeout = vi
      .advanceTimersByTimeAsync(20)
      .then(() => "timeout");

    await expect(Promise.race([replayedPromise, replayTimeout])).resolves.toBe(
      "timeout"
    );
    vi.useRealTimers();
  });

  test("rejects pending wait immediately when cancelled", async () => {
    const collector = createTurnResponseCollector();
    const pendingPromise = collector.waitForTurn({
      threadId: "thread-1",
      turnId: "turn-1"
    });

    collector.cancelTurn("turn-1");

    const outcome = await Promise.race([
      pendingPromise.then(
        () => "resolved",
        () => "rejected"
      ),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 20))
    ]);

    expect(outcome).toBe("rejected");
  });

  test("drops cancelled turn tombstones after retention window", async () => {
    vi.useFakeTimers();
    const collector = createTurnResponseCollector();

    collector.cancelTurn("turn-1");

    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);

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
      text: ""
    });

    vi.useRealTimers();
  });
});
