import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createSqliteJobManager } from "../../src/bridge/sqlite-job-manager.js";
import {
  initializeSqliteStore,
  readBridgeStateFromSqlite,
  writeBridgeStateToSqlite
} from "../../src/state/sqlite-store.js";
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

describe("createSqliteJobManager", () => {
  test("persists task lifecycle changes into jobs and job_logs", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-sqlite-jobs-"));
    const databasePath = join(tempDirectory, "bridge.db");
    const state = createInitialBridgeState(TEST_CONFIG);
    const database = initializeSqliteStore(databasePath);
    try {
      writeBridgeStateToSqlite(database, state);
    } finally {
      database.close();
    }

    const jobManager = createSqliteJobManager({
      state,
      databasePath
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
      now: 2_000,
      stage: "正在请求 Codex"
    });
    await jobManager.markCompleted({
      handle: job.handle,
      jobId: job.id,
      now: 3_000,
      summary: "完成"
    });
    jobManager.close();

    const verifyDatabase = initializeSqliteStore(databasePath);
    try {
      const restoredState = readBridgeStateFromSqlite(verifyDatabase);
      expect(restoredState.jobs[0]).toMatchObject({
        id: "job-1",
        status: "completed",
        summary: "完成"
      });
      expect(restoredState.jobs[0]?.logs.map((entry) => entry.message)).toEqual([
        "任务已创建：你好",
        "正在请求 Codex",
        "任务完成"
      ]);
    } finally {
      verifyDatabase.close();
    }
  });

  test("emits foreground slow notice once and records elapsed time", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-sqlite-jobs-"));
    const databasePath = join(tempDirectory, "bridge.db");
    const state = createInitialBridgeState(TEST_CONFIG);
    const database = initializeSqliteStore(databasePath);
    try {
      writeBridgeStateToSqlite(database, state);
    } finally {
      database.close();
    }

    const jobManager = createSqliteJobManager({
      state,
      databasePath
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

    await jobManager.maybeEmitProgress(30_000);
    await jobManager.maybeEmitProgress(60_000);

    expect(jobManager.drainNotifications()).toEqual([
      {
        handle: "+8613800000000",
        message: "任务 #job-1 已执行 25 秒，还在处理中，请稍等"
      }
    ]);
    expect(
      job.logs.filter((entry) => entry.message.includes("还在处理中"))
    ).toHaveLength(1);
    jobManager.close();
  });

  test("keeps recent log ordering so /logs can take the latest 10 entries", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bridge-sqlite-jobs-"));
    const databasePath = join(tempDirectory, "bridge.db");
    const state = createInitialBridgeState(TEST_CONFIG);
    const database = initializeSqliteStore(databasePath);
    try {
      writeBridgeStateToSqlite(database, state);
    } finally {
      database.close();
    }

    const jobManager = createSqliteJobManager({
      state,
      databasePath
    });
    const job = await jobManager.createJob({
      handle: "+8613800000000",
      sessionId: null,
      mode: "background",
      workflow: "autoresearch",
      prompt: "跑任务",
      title: "跑任务",
      sourceMessageIds: ["m1"],
      attachmentPaths: [],
      now: 1_000
    });

    for (let index = 1; index <= 12; index += 1) {
      await jobManager.markRunning({
        handle: job.handle,
        jobId: job.id,
        now: 1_000 + index,
        stage: `阶段 ${index}`
      });
    }

    expect(job.logs.slice(-10).map((entry) => entry.message)).toEqual([
      "阶段 3",
      "阶段 4",
      "阶段 5",
      "阶段 6",
      "阶段 7",
      "阶段 8",
      "阶段 9",
      "阶段 10",
      "阶段 11",
      "阶段 12"
    ]);
    jobManager.close();
  });
});
