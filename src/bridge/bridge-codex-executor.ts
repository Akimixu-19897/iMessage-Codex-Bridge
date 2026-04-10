import type { BackgroundJobState } from "../state/state-store.js";
import { usesAutoresearchWorkflow } from "./job-command.js";
import type { BridgeRuntimeAction } from "./bridge-runtime.js";
import type { JobNotification } from "./job-manager.js";

type RejectAction = Extract<BridgeRuntimeAction, { type: "reject" }>;
type SubmitAction = Extract<BridgeRuntimeAction, { type: "submit" }>;
type CommandAction = Extract<BridgeRuntimeAction, { type: "command" }>;
type SessionCommandAction = Extract<BridgeRuntimeAction, { type: "session_command" }>;
type JobCommandAction = Extract<BridgeRuntimeAction, { type: "job_command" }>;

export type BridgeReplyAction = {
  type: "reply";
  handle: string;
  message: string;
  threadId: string;
  turnId: string;
};

export type BridgeExecutionAction = RejectAction | BridgeReplyAction;

type JobManager = {
  createJob(params: {
    handle: string;
    sessionId: string | null;
    mode: "foreground" | "background";
    workflow: "generic" | "autoresearch";
    prompt: string;
    title: string;
    sourceMessageIds: string[];
    attachmentPaths: string[];
    now: number;
  }): Promise<BackgroundJobState>;
  listAllJobs(): BackgroundJobState[];
  listJobs(handle: string): BackgroundJobState[];
  getJob(handle: string, jobId: string): BackgroundJobState;
  recoverInterruptedJobs?(now: number): Promise<void>;
  markRunning(params: {
    handle: string;
    jobId: string;
    now: number;
    stage: string;
  }): Promise<BackgroundJobState>;
  bindTurn(params: {
    handle: string;
    jobId: string;
    now: number;
    threadId: string;
    turnId: string;
    stage: string;
  }): Promise<BackgroundJobState>;
  markWaitingInput(params: {
    handle: string;
    jobId: string;
    now: number;
    summary: string;
  }): Promise<void>;
  markCompleted(params: {
    handle: string;
    jobId: string;
    now: number;
    summary: string;
  }): Promise<void>;
  markFailed(params: {
    handle: string;
    jobId: string;
    now: number;
    errorMessage: string;
  }): Promise<void>;
  cancelJob(params: {
    handle: string;
    jobId: string;
    now: number;
    notify?: boolean;
  }): Promise<BackgroundJobState>;
  maybeEmitProgress(now: number): Promise<void>;
  drainNotifications(): JobNotification[];
};

type CreateBridgeCodexExecutorOptions = {
  submitTextTurn: (params: {
    handle: string;
    text: string;
    imagePaths?: string[];
    messageIds?: string[];
  }) => Promise<{
    sessionId?: string;
    threadId: string;
    turn: {
      id: string;
      status: string;
    };
  }>;
  waitForTurn: (params: {
    threadId: string;
    turnId: string;
    onDelta?: (params: { delta: string; text: string }) => void;
  }) => Promise<{
    text: string;
    status: string;
  }>;
  cancelWaitForTurn?: (params: {
    threadId: string;
    turnId: string;
  }) => void;
  interruptTurn?: (params: {
    threadId: string;
    turnId: string;
  }) => Promise<void>;
  executeAdminCommand?: (params: {
    handle: string;
    command: CommandAction["command"];
  }) => Promise<string>;
  executeSessionCommand?: (params: {
    handle: string;
    command: SessionCommandAction["command"];
  }) => Promise<string>;
  resolveCurrentSessionId?: (handle: string) => string | null;
  jobManager: JobManager;
  codexUnavailableMessage?: string;
  turnTimeoutMs?: {
    foreground?: number;
    background?: number;
    autoresearch?: number;
  };
};

export function createBridgeCodexExecutor(
  options: CreateBridgeCodexExecutorOptions
) {
  const activeJobIds = new Set<string>();
  const turnTimeoutMs = {
    foreground: options.turnTimeoutMs?.foreground ?? 10 * 60_000,
    background: options.turnTimeoutMs?.background ?? 30 * 60_000,
    autoresearch: options.turnTimeoutMs?.autoresearch ?? 8 * 60 * 60_000
  };

  function isJobCancelled(job: BackgroundJobState): boolean {
    try {
      return options.jobManager.getJob(job.handle, job.id).status === "cancelled";
    } catch {
      return false;
    }
  }

  async function startJob(job: BackgroundJobState, now: number): Promise<void> {
    if (activeJobIds.has(job.id) || job.status === "cancelled") {
      return;
    }

    activeJobIds.add(job.id);

    try {
      await options.jobManager.markRunning({
        handle: job.handle,
        jobId: job.id,
        now,
        stage: "正在请求 Codex"
      });

      const submittedTurn = await options.submitTextTurn({
        handle: job.handle,
        text: job.prompt,
        imagePaths: job.attachmentPaths,
        messageIds: job.sourceMessageIds
      });
      const stageTracker = createStageTracker(job, options);

      await options.jobManager.bindTurn({
        handle: job.handle,
        jobId: job.id,
        now: Date.now(),
        threadId: submittedTurn.threadId,
        turnId: submittedTurn.turn.id,
        stage: "Codex 正在处理"
      });

      if (isJobCancelled(job)) {
        options.cancelWaitForTurn?.({
          threadId: submittedTurn.threadId,
          turnId: submittedTurn.turn.id
        });

        if (options.interruptTurn) {
          await options.interruptTurn({
            threadId: submittedTurn.threadId,
            turnId: submittedTurn.turn.id
          });
        }
        return;
      }

      const completedTurn = await waitForTurnWithTimeout({
        waitForTurn: () =>
          options.waitForTurn({
            threadId: submittedTurn.threadId,
            turnId: submittedTurn.turn.id,
            onDelta: ({ text }) => {
              void stageTracker.onText(text);
            }
          }),
        timeoutMs:
          job.workflow === "autoresearch"
            ? turnTimeoutMs.autoresearch
            : job.mode === "foreground"
            ? turnTimeoutMs.foreground
            : turnTimeoutMs.background,
        onTimeout: async () => {
          options.cancelWaitForTurn?.({
            threadId: submittedTurn.threadId,
            turnId: submittedTurn.turn.id
          });

          if (!options.interruptTurn) {
            return;
          }

          await options.interruptTurn({
            threadId: submittedTurn.threadId,
            turnId: submittedTurn.turn.id
          });
        }
      });

      if (isJobCancelled(job)) {
        return;
      }

      const normalizedStatus = completedTurn.status.trim().toLowerCase();
      const summaryText = stripStageMarkers(completedTurn.text).trim();

      if (normalizedStatus === "interrupted") {
        await options.jobManager.cancelJob({
          handle: job.handle,
          jobId: job.id,
          now: Date.now()
        });
        return;
      }

      if (
        normalizedStatus.includes("wait") ||
        normalizedStatus.includes("input") ||
        normalizedStatus.includes("block")
      ) {
        await options.jobManager.markWaitingInput({
          handle: job.handle,
          jobId: job.id,
          now: Date.now(),
          summary: summaryText || "Codex 正在等待你提供更多信息。"
        });
        return;
      }

      await options.jobManager.markCompleted({
        handle: job.handle,
        jobId: job.id,
        now: Date.now(),
        summary: summaryText || "任务已完成，但没有返回文本结果。"
      });
    } catch (error) {
      if (isJobCancelled(job)) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : options.codexUnavailableMessage ?? "抱歉，Codex 暂时不可用，请稍后再试。";

      await options.jobManager.markFailed({
        handle: job.handle,
        jobId: job.id,
        now: Date.now(),
        errorMessage: message
      });
    } finally {
      activeJobIds.delete(job.id);
    }
  }

  async function ensureQueuedJobsStarted(now: number): Promise<void> {
    for (const job of options.jobManager.listAllJobs()) {
      if (job.status === "queued") {
        void startJob(job, now);
      }
    }
  }

  return {
    async execute(
      actions: BridgeRuntimeAction[],
      now: number
    ): Promise<BridgeExecutionAction[]> {
      const results: BridgeExecutionAction[] = [];

      for (const action of actions) {
        if (action.type === "reject") {
          results.push(action);
          continue;
        }

        if (action.type === "command") {
          results.push(await executeCommandAction(action, options));
          continue;
        }

        if (action.type === "session_command") {
          results.push(await executeSessionCommandAction(action, options));
          continue;
        }

        if (action.type === "job_command") {
          results.push(await executeJobCommandAction(action, options, now, startJob));
          continue;
        }

        results.push(await executeSubmitAction(action, options, now, startJob));
      }

      return results;
    },

    async poll(now: number): Promise<BridgeExecutionAction[]> {
      await options.jobManager.maybeEmitProgress(now);
      await ensureQueuedJobsStarted(now);

      return options.jobManager.drainNotifications().map((notification) => ({
        type: "reply",
        handle: notification.handle,
        message: notification.message,
        threadId: "job",
        turnId: "job"
      }));
    }
  };
}

class TurnTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnTimeoutError";
  }
}

async function waitForTurnWithTimeout<T>(params: {
  waitForTurn: () => Promise<T>;
  timeoutMs: number;
  onTimeout?: () => Promise<void>;
}): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      params.waitForTurn(),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          void params
            .onTimeout?.()
            .catch(() => undefined)
            .finally(() => {
              reject(new TurnTimeoutError("任务执行超时，请稍后重试。"));
            });
        }, params.timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function executeSessionCommandAction(
  action: SessionCommandAction,
  options: CreateBridgeCodexExecutorOptions
): Promise<BridgeReplyAction> {
  try {
    const message = await (options.executeSessionCommand
      ? options.executeSessionCommand({
          handle: action.handle,
          command: action.command
        })
      : Promise.resolve("会话命令未配置。"));

    return {
      type: "reply",
      handle: action.handle,
      message,
      threadId: "session-command",
      turnId: "session-command"
    };
  } catch (error) {
    return {
      type: "reply",
      handle: action.handle,
      message:
        error instanceof Error ? error.message : "会话命令执行失败，请稍后重试。",
      threadId: "session-command",
      turnId: "session-command"
    };
  }
}

async function executeCommandAction(
  action: CommandAction,
  options: CreateBridgeCodexExecutorOptions
): Promise<BridgeReplyAction> {
  try {
    const message = await (options.executeAdminCommand
      ? options.executeAdminCommand({
          handle: action.handle,
          command: action.command
        })
      : Promise.resolve("管理员命令未配置。"));

    return {
      type: "reply",
      handle: action.handle,
      message,
      threadId: "admin-command",
      turnId: "admin-command"
    };
  } catch {
    return {
      type: "reply",
      handle: action.handle,
      message: "管理员命令执行失败，请稍后重试。",
      threadId: "admin-command",
      turnId: "admin-command"
    };
  }
}

async function executeJobCommandAction(
  action: JobCommandAction,
  options: CreateBridgeCodexExecutorOptions,
  now: number,
  startJob: (job: BackgroundJobState, now: number) => Promise<void>
): Promise<BridgeReplyAction> {
  if (action.command.type === "invalid") {
    return {
      type: "reply",
      handle: action.handle,
      message: action.command.message,
      threadId: "job-command",
      turnId: "job-command"
    };
  }

  if (action.command.type === "task") {
    const workflow = usesAutoresearchWorkflow(action.command.prompt)
      ? "autoresearch"
      : "generic";
    const job = await options.jobManager.createJob({
      handle: action.handle,
      sessionId: options.resolveCurrentSessionId?.(action.handle) ?? null,
      mode: "background",
      workflow,
      prompt:
        workflow === "autoresearch"
          ? buildAutoresearchPrompt(action.command.prompt)
          : action.command.prompt,
      title: summarizeTitle(action.command.prompt),
      sourceMessageIds: [],
      attachmentPaths: [],
      now
    });
    void startJob(job, now);

    return {
      type: "reply",
      handle: action.handle,
      message: `任务 #${job.id} 已启动：${job.title}`,
      threadId: "job-command",
      turnId: "job-command"
    };
  }

  if (action.command.type === "research") {
    const job = await options.jobManager.createJob({
      handle: action.handle,
      sessionId: options.resolveCurrentSessionId?.(action.handle) ?? null,
      mode: "background",
      workflow: "autoresearch",
      prompt: buildAutoresearchPrompt(action.command.goal),
      title: summarizeTitle(`研究：${action.command.goal}`),
      sourceMessageIds: [],
      attachmentPaths: [],
      now
    });
    void startJob(job, now);

    return {
      type: "reply",
      handle: action.handle,
      message: `研究任务 #${job.id} 已启动：${job.title}`,
      threadId: "job-command",
      turnId: "job-command"
    };
  }

  if (action.command.type === "jobs") {
    return {
      type: "reply",
      handle: action.handle,
      message: formatJobs(options.jobManager.listJobs(action.handle)),
      threadId: "job-command",
      turnId: "job-command"
    };
  }

  if (action.command.type === "status") {
    try {
      const job = options.jobManager.getJob(action.handle, action.command.jobId);
      return {
        type: "reply",
        handle: action.handle,
        message: formatJobStatus(job),
        threadId: "job-command",
        turnId: "job-command"
      };
    } catch (error) {
      return formatJobCommandError(action.handle, error);
    }
  }

  if (action.command.type === "logs") {
    try {
      const job = options.jobManager.getJob(action.handle, action.command.jobId);
      return {
        type: "reply",
        handle: action.handle,
        message: formatJobLogs(job),
        threadId: "job-command",
        turnId: "job-command"
      };
    } catch (error) {
      return formatJobCommandError(action.handle, error);
    }
  }

  try {
    const job = options.jobManager.getJob(action.handle, action.command.jobId);
    const runningTurn =
      job.status === "running" && job.threadId && job.turnId
        ? {
            threadId: job.threadId,
            turnId: job.turnId
          }
        : null;

    await options.jobManager.cancelJob({
      handle: action.handle,
      jobId: action.command.jobId,
      now,
      notify: false
    });

    if (runningTurn) {
      options.cancelWaitForTurn?.({
        threadId: runningTurn.threadId,
        turnId: runningTurn.turnId
      });

      if (options.interruptTurn) {
        await options.interruptTurn({
          threadId: runningTurn.threadId,
          turnId: runningTurn.turnId
        });
      }
    }

    return {
      type: "reply",
      handle: action.handle,
      message: `任务 #${action.command.jobId} 已取消`,
      threadId: "job-command",
      turnId: "job-command"
    };
  } catch (error) {
    return formatJobCommandError(action.handle, error);
  }
}

async function executeSubmitAction(
  action: SubmitAction,
  options: CreateBridgeCodexExecutorOptions,
  now: number,
  startJob: (job: BackgroundJobState, now: number) => Promise<void>
): Promise<BridgeReplyAction> {
  const job = await options.jobManager.createJob({
    handle: action.batch.handle,
    sessionId: options.resolveCurrentSessionId?.(action.batch.handle) ?? null,
    mode: action.batch.background ? "background" : "foreground",
    workflow:
      action.batch.background && usesAutoresearchWorkflow(action.batch.text)
        ? "autoresearch"
        : "generic",
    prompt:
      action.batch.background && usesAutoresearchWorkflow(action.batch.text)
        ? buildAutoresearchPrompt(action.batch.text)
        : action.batch.text,
    title: summarizeTitle(action.batch.text),
    sourceMessageIds: action.batch.messageIds,
    attachmentPaths: action.batch.attachments,
    now
  });

  void startJob(job, now);

  return {
    type: "reply",
    handle: action.batch.handle,
    message: action.batch.background
      ? `已识别为长任务，任务 #${job.id} 已启动，可发送 /status ${job.id} 查看状态。`
      : `已收到，Codex 正在处理…（任务 #${job.id}）`,
    threadId: "job-submit",
    turnId: "job-submit"
  };
}

function formatJobCommandError(
  handle: string,
  error: unknown
): BridgeReplyAction {
  return {
    type: "reply",
    handle,
    message: error instanceof Error ? error.message : "任务命令执行失败，请稍后重试。",
    threadId: "job-command",
    turnId: "job-command"
  };
}

function createStageTracker(
  job: BackgroundJobState,
  options: CreateBridgeCodexExecutorOptions
) {
  let lastStage: string | null = null;
  let lastText = "";

  return {
    async onText(text: string): Promise<void> {
      if (job.workflow !== "autoresearch") {
        lastText = text;
        return;
      }

      const appendedText = text.startsWith(lastText)
        ? text.slice(lastText.length)
        : text;
      lastText = text;

      for (const stage of extractStageMarkers(appendedText)) {
        if (stage === lastStage) {
          continue;
        }

        lastStage = stage;
        await options.jobManager.markRunning({
          handle: job.handle,
          jobId: job.id,
          now: Date.now(),
          stage
        });
      }
    }
  };
}

function extractStageMarkers(text: string): string[] {
  const matches = text.matchAll(/\[\[bridge-stage:(.+?)\]\]/g);
  return Array.from(matches, (match) => match[1]?.trim()).filter(
    (stage): stage is string => Boolean(stage)
  );
}

function stripStageMarkers(text: string): string {
  return text.replace(/\[\[bridge-stage:.+?\]\]\s*/g, "");
}

function buildAutoresearchPrompt(goal: string): string {
  return [
    "请使用 [$codex-autoresearch](/Users/akimixu/.cc-switch/skills/codex-autoresearch/SKILL.md) 技能，在当前 workspace 中以后台长任务方式持续工作，直到该目标完成或遇到明确阻塞。",
    `用户目标：${goal}`,
    "你必须在关键阶段切换时单独输出一行阶段标记，格式严格如下：[[bridge-stage:阶段名]]",
    "至少在以下阶段切换时输出阶段标记：分析需求、建立基线、实施修改、运行验证、整理结果、已完成。",
    "除阶段标记外，其余内容正常输出中文进展与最终结果摘要。"
  ].join("\n");
}

function summarizeTitle(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length <= 24 ? trimmed : `${trimmed.slice(0, 24)}…`;
}

function formatJobs(jobs: BackgroundJobState[]): string {
  if (jobs.length === 0) {
    return "当前没有任务。";
  }

  return [
    "任务列表：",
    ...jobs.slice(0, 10).map((job) => `#${job.id} [${job.status}] ${job.title}`)
  ].join("\n");
}

function formatJobStatus(job: BackgroundJobState): string {
  return [
    `任务：#${job.id}`,
    `状态：${job.status}`,
    `标题：${job.title}`,
    `阶段：${job.currentStage ?? "-"}`,
    `创建时间：${new Date(job.createdAt).toLocaleString("zh-CN", { hour12: false })}`,
    `摘要：${job.summary ?? job.errorMessage ?? "-"}`
  ].join("\n");
}

function formatJobLogs(job: BackgroundJobState): string {
  if (job.logs.length === 0) {
    return `任务 #${job.id} 暂无日志。`;
  }

  return [
    `任务 #${job.id} 最近日志：`,
    ...job.logs.slice(-10).map((entry) => {
      const time = new Date(entry.at).toLocaleString("zh-CN", { hour12: false });
      return `${time} ${entry.message}`;
    })
  ].join("\n");
}
