import type { BackgroundJobState, BridgeState } from "../state/state-store.js";

export type JobNotification = {
  handle: string;
  message: string;
};

type CreateJobManagerOptions = {
  state: BridgeState;
  saveState: () => Promise<void>;
};

type CreateJobParams = {
  handle: string;
  sessionId: string | null;
  mode: "foreground" | "background";
  workflow: "generic" | "autoresearch";
  prompt: string;
  title: string;
  sourceMessageIds: string[];
  attachmentPaths: string[];
  now: number;
};

export function createJobManager(options: CreateJobManagerOptions) {
  const pendingNotifications: JobNotification[] = [];

  function enqueueNotification(notification: JobNotification): void {
    pendingNotifications.push(notification);
  }

  function findJob(handle: string, jobId: string): BackgroundJobState {
    const job = options.state.jobs.find(
      (item) => item.id === jobId && item.handle === handle
    );

    if (!job) {
      throw new Error(`未找到任务：${jobId}`);
    }

    return job;
  }

  function scheduleNextHeartbeat(job: BackgroundJobState, now: number): void {
    const startedAt = job.startedAt ?? job.createdAt;
    const elapsedMs = Math.max(0, now - startedAt);
    const intervalMs =
      elapsedMs < 5 * 60_000
        ? 2 * 60_000
        : elapsedMs < 30 * 60_000
          ? 5 * 60_000
          : elapsedMs < 2 * 60 * 60_000
            ? 15 * 60_000
            : 30 * 60_000;

    job.nextHeartbeatAt = now + intervalMs;
  }

  function formatElapsed(now: number, startedAt: number): string {
    const totalMinutes = Math.max(1, Math.floor((now - startedAt) / 60_000));

    if (totalMinutes < 60) {
      return `${totalMinutes} 分钟`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
      return `${hours} 小时`;
    }

    return `${hours} 小时 ${minutes} 分钟`;
  }

  function maybeNotifyStageChange(
    job: BackgroundJobState,
    previousStage: string | null,
    nextStage: string
  ): void {
    if (
      job.workflow !== "autoresearch" ||
      previousStage === nextStage ||
      nextStage === "正在请求 Codex" ||
      nextStage === "Codex 正在处理"
    ) {
      return;
    }

    enqueueNotification({
      handle: job.handle,
      message: `任务 #${job.id} 阶段更新：${nextStage}`
    });
  }

  return {
    async createJob(params: CreateJobParams): Promise<BackgroundJobState> {
      const job: BackgroundJobState = {
        id: `job-${options.state.nextJobSequence}`,
        handle: params.handle,
        sessionId: params.sessionId,
        mode: params.mode,
        workflow: params.workflow,
        prompt: params.prompt,
        title: params.title,
        sourceMessageIds: params.sourceMessageIds,
        attachmentPaths: params.attachmentPaths,
        status: "queued",
        createdAt: params.now,
        updatedAt: params.now,
        startedAt: null,
        finishedAt: null,
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
            at: params.now,
            message: `任务已创建：${params.title}`
          }
        ]
      };
      options.state.nextJobSequence += 1;
      options.state.jobs.unshift(job);
      await options.saveState();
      return job;
    },

    listJobs(handle: string): BackgroundJobState[] {
      return options.state.jobs.filter((job) => job.handle === handle);
    },

    listAllJobs(): BackgroundJobState[] {
      return [...options.state.jobs];
    },

    async recoverInterruptedJobs(now: number): Promise<void> {
      let dirty = false;

      for (const job of options.state.jobs) {
        if (
          job.status !== "queued" &&
          job.status !== "running" &&
          job.status !== "waiting_input"
        ) {
          continue;
        }

        dirty = true;
        job.updatedAt = now;
        job.threadId = null;
        job.turnId = null;
        job.lastHeartbeatAt = null;
        job.nextHeartbeatAt = null;
        job.slowNoticeSentAt = null;

        if (job.mode === "background") {
          job.status = "queued";
          job.currentStage = "等待恢复";
          job.logs.push({
            at: now,
            message: "bridge 重启后任务已重新排队"
          });
          continue;
        }

        job.status = "failed";
        job.finishedAt = now;
        job.currentStage = "执行失败";
        job.errorMessage = "bridge 重启，前台任务已中断，请重新发送。";
        job.logs.push({
          at: now,
          message: "bridge 重启导致前台任务中断"
        });
      }

      if (dirty) {
        await options.saveState();
      }
    },

    getJob(handle: string, jobId: string): BackgroundJobState {
      return findJob(handle, jobId);
    },

    async markRunning(params: {
      handle: string;
      jobId: string;
      now: number;
      stage: string;
    }): Promise<BackgroundJobState> {
      const job = findJob(params.handle, params.jobId);
      const previousStage = job.currentStage;
      job.status = "running";
      job.startedAt ??= params.now;
      job.updatedAt = params.now;
      job.currentStage = params.stage;
      job.logs.push({
        at: params.now,
        message: params.stage
      });
      maybeNotifyStageChange(job, previousStage, params.stage);
      scheduleNextHeartbeat(job, params.now);
      await options.saveState();
      return job;
    },

    async bindTurn(params: {
      handle: string;
      jobId: string;
      now: number;
      threadId: string;
      turnId: string;
      stage: string;
    }): Promise<BackgroundJobState> {
      const job = findJob(params.handle, params.jobId);
      const previousStage = job.currentStage;
      job.threadId = params.threadId;
      job.turnId = params.turnId;
      job.currentStage = params.stage;
      job.updatedAt = params.now;
      job.logs.push({
        at: params.now,
        message: params.stage
      });
      maybeNotifyStageChange(job, previousStage, params.stage);
      scheduleNextHeartbeat(job, params.now);
      await options.saveState();
      return job;
    },

    async markWaitingInput(params: {
      handle: string;
      jobId: string;
      now: number;
      summary: string;
    }): Promise<void> {
      const job = findJob(params.handle, params.jobId);
      job.status = "waiting_input";
      job.updatedAt = params.now;
      job.summary = params.summary;
      job.currentStage = "等待用户输入";
      job.logs.push({
        at: params.now,
        message: "等待用户输入"
      });
      enqueueNotification({
        handle: job.handle,
        message: `任务 #${job.id} 需要你进一步输入：${params.summary}`
      });
      await options.saveState();
    },

    async markCompleted(params: {
      handle: string;
      jobId: string;
      now: number;
      summary: string;
    }): Promise<void> {
      const job = findJob(params.handle, params.jobId);
      job.status = "completed";
      job.updatedAt = params.now;
      job.finishedAt = params.now;
      job.summary = params.summary;
      job.currentStage = "已完成";
      job.nextHeartbeatAt = null;
      job.logs.push({
        at: params.now,
        message: "任务完成"
      });
      enqueueNotification({
        handle: job.handle,
        message: `任务 #${job.id} 已完成\n${params.summary}`
      });
      await options.saveState();
    },

    async markFailed(params: {
      handle: string;
      jobId: string;
      now: number;
      errorMessage: string;
    }): Promise<void> {
      const job = findJob(params.handle, params.jobId);
      job.status = "failed";
      job.updatedAt = params.now;
      job.finishedAt = params.now;
      job.errorMessage = params.errorMessage;
      job.currentStage = "执行失败";
      job.nextHeartbeatAt = null;
      job.logs.push({
        at: params.now,
        message: `任务失败：${params.errorMessage}`
      });
      enqueueNotification({
        handle: job.handle,
        message: `任务 #${job.id} 执行失败：${params.errorMessage}`
      });
      await options.saveState();
    },

    async cancelJob(params: {
      handle: string;
      jobId: string;
      now: number;
      notify?: boolean;
    }): Promise<BackgroundJobState> {
      const job = findJob(params.handle, params.jobId);
      job.status = "cancelled";
      job.updatedAt = params.now;
      job.finishedAt = params.now;
      job.currentStage = "已取消";
      job.nextHeartbeatAt = null;
      job.logs.push({
        at: params.now,
        message: "任务已取消"
      });
      if (params.notify ?? true) {
        enqueueNotification({
          handle: job.handle,
          message: `任务 #${job.id} 已取消`
        });
      }
      await options.saveState();
      return job;
    },

    async maybeEmitProgress(now: number): Promise<void> {
      let dirty = false;

      for (const job of options.state.jobs) {
        if (job.status !== "running") {
          continue;
        }

        if (
          job.mode === "foreground" &&
          job.slowNoticeSentAt === null &&
          now - job.createdAt >= 5_000
        ) {
          job.slowNoticeSentAt = now;
          job.updatedAt = now;
          job.logs.push({
            at: now,
            message: "还在处理中，请稍等"
          });
          enqueueNotification({
            handle: job.handle,
            message: `任务 #${job.id} 还在处理中，请稍等`
          });
          dirty = true;
        }

        if (job.nextHeartbeatAt !== null && now >= job.nextHeartbeatAt) {
          const startedAt = job.startedAt ?? job.createdAt;
          const elapsed = formatElapsed(now, startedAt);
          job.lastHeartbeatAt = now;
          job.updatedAt = now;
          job.logs.push({
            at: now,
            message: `仍在运行，已 ${elapsed}`
          });
          enqueueNotification({
            handle: job.handle,
            message:
              job.currentStage && job.currentStage.length > 0
                ? `任务 #${job.id} 当前阶段：${job.currentStage}（已 ${elapsed}）`
                : `任务 #${job.id} 仍在运行，已 ${elapsed}`
          });
          scheduleNextHeartbeat(job, now);
          dirty = true;
        }
      }

      if (dirty) {
        await options.saveState();
      }
    },

    drainNotifications(): JobNotification[] {
      return pendingNotifications.splice(0, pendingNotifications.length);
    }
  };
}
