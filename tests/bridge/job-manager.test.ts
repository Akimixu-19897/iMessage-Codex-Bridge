import { describe, expect, test, vi } from "vitest";

import { createJobManager } from "../../src/bridge/job-manager.js";
import { createInitialBridgeState } from "../../src/state/state-store.js";

const TEST_CONFIG = {
  rejectionMessage: "请联系管理员开通权限。",
  messageMergeWindowMs: 5000,
  contacts: [
    {
      handle: "+8613800000000",
      name: "联系人 A",
      workspace: "/tmp/workspace-a"
    }
  ]
};

describe("createJobManager", () => {
  test("emits foreground slow notice 25 seconds after acknowledgement with elapsed time", async () => {
    const saveState = vi.fn(async () => {});
    const jobManager = createJobManager({
      state: createInitialBridgeState(TEST_CONFIG),
      saveState
    });
    const job = await jobManager.createJob({
      handle: "+8613800000000",
      sessionId: null,
      mode: "foreground",
      workflow: "generic",
      prompt: "你好",
      title: "你好",
      sourceMessageIds: ["m1"],
      attachmentPaths: [],
      now: 1_000
    });

    await jobManager.markRunning({
      handle: job.handle,
      jobId: job.id,
      now: 1_000,
      stage: "正在请求 Codex"
    });
    await jobManager.markAcknowledged({
      handle: job.handle,
      jobId: job.id,
      now: 5_000
    });

    await jobManager.maybeEmitProgress(29_999);
    expect(jobManager.drainNotifications()).toEqual([]);

    await jobManager.maybeEmitProgress(30_000);
    expect(jobManager.drainNotifications()).toEqual([
      {
        handle: "+8613800000000",
        message: "任务 #job-1 已执行 25 秒，还在处理中，请稍等"
      }
    ]);
  });
});
