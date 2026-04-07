import type { BridgeRuntimeAction } from "./bridge-runtime.js";

type RejectAction = Extract<BridgeRuntimeAction, { type: "reject" }>;
type SubmitAction = Extract<BridgeRuntimeAction, { type: "submit" }>;
type CommandAction = Extract<BridgeRuntimeAction, { type: "command" }>;

export type BridgeReplyAction = {
  type: "reply";
  handle: string;
  message: string;
  threadId: string;
  turnId: string;
};

export type BridgeExecutionAction = RejectAction | BridgeReplyAction;

type CreateBridgeCodexExecutorOptions = {
  submitTextTurn: (params: {
    handle: string;
    text: string;
    imagePaths?: string[];
    messageIds?: string[];
  }) => Promise<{
    threadId: string;
    turn: {
      id: string;
      status: string;
    };
  }>;
  waitForTurn: (params: {
    threadId: string;
    turnId: string;
  }) => Promise<{
    text: string;
    status: string;
  }>;
  executeAdminCommand?: (params: {
    handle: string;
    command: CommandAction["command"];
  }) => Promise<string>;
  codexUnavailableMessage?: string;
};

export function createBridgeCodexExecutor(
  options: CreateBridgeCodexExecutorOptions
) {
  return {
    async execute(
      actions: BridgeRuntimeAction[]
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

        results.push(await executeSubmitAction(action, options));
      }

      return results;
    }
  };
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

async function executeSubmitAction(
  action: SubmitAction,
  options: CreateBridgeCodexExecutorOptions
): Promise<BridgeReplyAction> {
  try {
    const submittedTurn = await options.submitTextTurn({
      handle: action.batch.handle,
      text: action.batch.text,
      imagePaths: action.batch.attachments,
      messageIds: action.batch.messageIds
    });
    const completedTurn = await options.waitForTurn({
      threadId: submittedTurn.threadId,
      turnId: submittedTurn.turn.id
    });

    return {
      type: "reply",
      handle: action.batch.handle,
      message: completedTurn.text,
      threadId: submittedTurn.threadId,
      turnId: submittedTurn.turn.id
    };
  } catch {
    return {
      type: "reply",
      handle: action.batch.handle,
      message:
        options.codexUnavailableMessage ?? "抱歉，Codex 暂时不可用，请稍后再试。",
      threadId: "unavailable",
      turnId: "unavailable"
    };
  }
}
