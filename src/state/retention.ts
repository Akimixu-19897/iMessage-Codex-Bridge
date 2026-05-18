import type { BridgeState } from "./state-store.js";

export const DEFAULT_JOB_RETENTION_DAYS = 30;
export const DEFAULT_MAX_COMPLETED_JOBS = 200;

export type JobRetentionPolicy = {
  now: number;
  retentionDays?: number;
  maxCompletedJobs?: number;
};

export type JobRetentionResult = {
  removedJobs: number;
};

const ENDED_STATUSES = new Set(["completed", "failed", "cancelled"]);

export function applyJobRetentionPolicy(
  state: BridgeState,
  policy: JobRetentionPolicy
): JobRetentionResult {
  const retentionDays = policy.retentionDays ?? DEFAULT_JOB_RETENTION_DAYS;
  const maxCompletedJobs = policy.maxCompletedJobs ?? DEFAULT_MAX_COMPLETED_JOBS;
  const cutoff = policy.now - retentionDays * 24 * 60 * 60 * 1000;
  const endedJobsByHandle = new Map<string, BridgeState["jobs"]>();
  const removeIds = new Set<string>();

  for (const job of state.jobs) {
    if (!ENDED_STATUSES.has(job.status)) {
      continue;
    }

    const finishedAt = job.finishedAt ?? job.updatedAt;
    if (finishedAt < cutoff) {
      removeIds.add(job.id);
      continue;
    }

    const jobs = endedJobsByHandle.get(job.handle) ?? [];
    jobs.push(job);
    endedJobsByHandle.set(job.handle, jobs);
  }

  for (const jobs of endedJobsByHandle.values()) {
    const sortedJobs = [...jobs].sort(
      (left, right) =>
        (right.finishedAt ?? right.updatedAt) - (left.finishedAt ?? left.updatedAt)
    );

    for (const job of sortedJobs.slice(maxCompletedJobs)) {
      removeIds.add(job.id);
    }
  }

  if (removeIds.size === 0) {
    return {
      removedJobs: 0
    };
  }

  const originalCount = state.jobs.length;
  state.jobs = state.jobs.filter((job) => !removeIds.has(job.id));

  return {
    removedJobs: originalCount - state.jobs.length
  };
}

export function parseOptionalPositiveInteger(
  value: string | undefined
): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`配置值必须是正整数: ${value}`);
  }

  return parsed;
}
