import type { ResolvedCodexThread } from "./thread-service.js";
import type { CodexAppServerClient, CodexTurn } from "./app-server-client.js";

type CreateTurnServiceOptions = {
  appServerClient: CodexAppServerClient;
  threadService: {
    ensureThread(handle: string): Promise<ResolvedCodexThread>;
  };
};

export type SubmittedCodexTurn = {
  handle: string;
  sessionId: string;
  threadId: string;
  workspace: string;
  turn: CodexTurn;
};

export function createTurnService(options: CreateTurnServiceOptions) {
  return {
    async submitTextTurn(params: {
      handle: string;
      text: string;
      imagePaths?: string[];
    }): Promise<SubmittedCodexTurn> {
      const resolvedThread = await options.threadService.ensureThread(params.handle);
      const turn = await options.appServerClient.startTurn({
        threadId: resolvedThread.threadId,
        cwd: resolvedThread.workspace,
        input: [
          {
            type: "text",
            text: params.text
          },
          ...(params.imagePaths ?? []).map((path) => ({
            type: "localImage" as const,
            path
          }))
        ]
      });

      return {
        handle: params.handle,
        sessionId: resolvedThread.sessionId,
        threadId: resolvedThread.threadId,
        workspace: resolvedThread.workspace,
        turn
      };
    }
  };
}
