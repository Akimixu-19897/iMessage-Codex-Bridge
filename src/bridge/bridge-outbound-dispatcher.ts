import type { BridgeExecutionAction } from "./bridge-codex-executor.js";

type CreateBridgeOutboundDispatcherOptions = {
  sendTextMessage: (params: {
    to: string;
    text: string;
  }) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

export type BridgeOutboundResult = {
  handle: string;
  message: string;
  exitCode: number;
};

export function createBridgeOutboundDispatcher(
  options: CreateBridgeOutboundDispatcherOptions
) {
  return {
    async dispatch(
      actions: BridgeExecutionAction[]
    ): Promise<BridgeOutboundResult[]> {
      const results: BridgeOutboundResult[] = [];

      for (const action of actions) {
        const sendResult = await options.sendTextMessage({
          to: action.handle,
          text: action.message
        });

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
