import { describe, expect, test } from "vitest";

import { applyJobRetentionPolicy } from "../../src/state/retention.js";
import type { BackgroundJobState, BridgeState } from "../../src/state/state-store.js";

function createState(jobs: BackgroundJobState[]): BridgeState {
  return {
    version: 3,
    contacts: [],
    processedMessages: [],
    outboundMessages: [],
    attachments: [],
    nextJobSequence: 1,
    jobs
  };
}

function createJob(
  id: string,
  status: BackgroundJobState["status"],
  finishedAt: number | null,
  handle = "+8613800000000"
): BackgroundJobState {
  return {
    id,
    handle,
    sessionId: null,
    mode: "background",
    workflow: "generic",
    prompt: id,
    title: id,
    sourceMessageIds: [],
    attachmentPaths: [],
    status,
    createdAt: finishedAt ?? 1_000,
    acknowledgedAt: null,
    updatedAt: finishedAt ?? 1_000,
    startedAt: null,
    finishedAt,
    currentStage: null,
    summary: null,
    errorMessage: null,
    threadId: null,
    turnId: null,
    lastHeartbeatAt: null,
    nextHeartbeatAt: null,
    slowNoticeSentAt: null,
    logs: [
      {
        at: finishedAt ?? 1_000,
        message: id
      }
    ]
  };
}

describe("applyJobRetentionPolicy", () => {
  test("removes ended jobs older than the retention window", () => {
    const state = createState([
      createJob("old-completed", "completed", 1_000),
      createJob("recent-completed", "completed", 10 * 24 * 60 * 60 * 1000),
      createJob("running-old", "running", 1_000)
    ]);

    const result = applyJobRetentionPolicy(state, {
      now: 31 * 24 * 60 * 60 * 1000,
      retentionDays: 30
    });

    expect(result.removedJobs).toBe(1);
    expect(state.jobs.map((job) => job.id)).toEqual([
      "recent-completed",
      "running-old"
    ]);
  });

  test("keeps only the latest N ended jobs per contact", () => {
    const state = createState([
      createJob("job-1", "completed", 1_000),
      createJob("job-2", "failed", 2_000),
      createJob("job-3", "cancelled", 3_000),
      createJob("other-1", "completed", 1_000, "+8613900000000")
    ]);

    const result = applyJobRetentionPolicy(state, {
      now: 4_000,
      retentionDays: 30,
      maxCompletedJobs: 2
    });

    expect(result.removedJobs).toBe(1);
    expect(state.jobs.map((job) => job.id)).toEqual(["job-2", "job-3", "other-1"]);
  });

  test("never removes active jobs even when they are old", () => {
    const state = createState([
      createJob("queued", "queued", null),
      createJob("running", "running", null),
      createJob("waiting", "waiting_input", null)
    ]);

    const result = applyJobRetentionPolicy(state, {
      now: 365 * 24 * 60 * 60 * 1000,
      retentionDays: 1,
      maxCompletedJobs: 1
    });

    expect(result.removedJobs).toBe(0);
    expect(state.jobs).toHaveLength(3);
  });
});
