import type { BridgeExecutionAction } from "./bridge-codex-executor.js";

type CreateBridgeOutboundDispatcherOptions = {
  sendTextMessage: (params: { to: string; text: string }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
  logError?: (...args: unknown[]) => void;
};

export type BridgeOutboundResult = {
  handle: string;
  message: string;
  exitCode: number;
};

export function createBridgeOutboundDispatcher(
  options: CreateBridgeOutboundDispatcherOptions
) {
  const logError = options.logError ?? console.error;

  return {
    async dispatch(actions: BridgeExecutionAction[]): Promise<BridgeOutboundResult[]> {
      const results: BridgeOutboundResult[] = [];

      for (const action of actions) {
        const sendResult = await options.sendTextMessage({
          to: action.handle,
          text: action.message
        });

        if (sendResult.exitCode !== 0) {
          logError("bridge outbound send failed:", {
            handle: action.handle,
            exitCode: sendResult.exitCode,
            stderr: sendResult.stderr
          });
        }

        results.push({
          handle: action.handle,
          message: action.message,
          exitCode: sendResult.exitCode
        });
      }

      return results;
    }
  };
}
