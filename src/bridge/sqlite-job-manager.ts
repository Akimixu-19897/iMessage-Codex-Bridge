import type { BridgeState } from "../state/state-store.js";
import {
  initializeSqliteStore,
  replaceSqliteJobs,
  upsertSqliteJob
} from "../state/sqlite-store.js";
import { createJobManager } from "./job-manager.js";

type CreateSqliteJobManagerOptions = {
  state: BridgeState;
  databasePath: string;
};

export function createSqliteJobManager(options: CreateSqliteJobManagerOptions) {
  const database = initializeSqliteStore(options.databasePath);
  const manager = createJobManager({
    state: options.state,
    saveState: async () => {}
  });

  function persistJob(handle: string, jobId: string): void {
    upsertSqliteJob(
      database,
      manager.getJob(handle, jobId),
      options.state.nextJobSequence
    );
  }

  function persistAllJobs(): void {
    replaceSqliteJobs(database, options.state.jobs, options.state.nextJobSequence);
  }

  return {
    async createJob(
      params: Parameters<typeof manager.createJob>[0]
    ): ReturnType<typeof manager.createJob> {
      const job = await manager.createJob(params);
      upsertSqliteJob(database, job, options.state.nextJobSequence);
      return job;
    },

    listJobs: manager.listJobs,
    listAllJobs: manager.listAllJobs,
    getJob: manager.getJob,

    async recoverInterruptedJobs(now: number): Promise<void> {
      await manager.recoverInterruptedJobs(now);
      persistAllJobs();
    },

    async markAcknowledged(
      params: Parameters<typeof manager.markAcknowledged>[0]
    ): ReturnType<typeof manager.markAcknowledged> {
      const job = await manager.markAcknowledged(params);
      upsertSqliteJob(database, job, options.state.nextJobSequence);
      return job;
    },

    async markRunning(
      params: Parameters<typeof manager.markRunning>[0]
    ): ReturnType<typeof manager.markRunning> {
      const job = await manager.markRunning(params);
      upsertSqliteJob(database, job, options.state.nextJobSequence);
      return job;
    },

    async bindTurn(
      params: Parameters<typeof manager.bindTurn>[0]
    ): ReturnType<typeof manager.bindTurn> {
      const job = await manager.bindTurn(params);
      upsertSqliteJob(database, job, options.state.nextJobSequence);
      return job;
    },

    async markWaitingInput(
      params: Parameters<typeof manager.markWaitingInput>[0]
    ): ReturnType<typeof manager.markWaitingInput> {
      await manager.markWaitingInput(params);
      persistJob(params.handle, params.jobId);
    },

    async markCompleted(
      params: Parameters<typeof manager.markCompleted>[0]
    ): ReturnType<typeof manager.markCompleted> {
      await manager.markCompleted(params);
      persistJob(params.handle, params.jobId);
    },

    async markFailed(
      params: Parameters<typeof manager.markFailed>[0]
    ): ReturnType<typeof manager.markFailed> {
      await manager.markFailed(params);
      persistJob(params.handle, params.jobId);
    },

    async cancelJob(
      params: Parameters<typeof manager.cancelJob>[0]
    ): ReturnType<typeof manager.cancelJob> {
      const job = await manager.cancelJob(params);
      upsertSqliteJob(database, job, options.state.nextJobSequence);
      return job;
    },

    async maybeEmitProgress(now: number): Promise<void> {
      await manager.maybeEmitProgress(now);
      persistAllJobs();
    },

    drainNotifications: manager.drainNotifications,

    close(): void {
      database.close();
    }
  };
}
