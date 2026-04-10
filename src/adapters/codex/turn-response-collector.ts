type AgentMessageDeltaNotification = {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
};

type TurnCompletedNotification = {
  threadId: string;
  turn: {
    id: string;
    status: string;
  };
};

type PendingTurn = {
  threadId: string;
  text: string;
  status: string | null;
  resolve?: (value: CompletedTurnResult) => void;
  reject?: (error: Error) => void;
  onDelta?: (params: { delta: string; text: string }) => void;
};

export type CompletedTurnResult = {
  threadId: string;
  turnId: string;
  status: string;
  text: string;
};

const CANCELLED_TURN_RETENTION_MS = 5 * 60_000;

class TurnCancelledError extends Error {
  constructor(turnId: string) {
    super(`turn cancelled: ${turnId}`);
    this.name = "TurnCancelledError";
  }
}

export function createTurnResponseCollector() {
  const pendingTurns = new Map<string, PendingTurn>();
  const cancelledTurns = new Set<string>();
  const cancelledTurnCleanupTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  function clearCancelledTurn(turnId: string): void {
    const cleanupTimer = cancelledTurnCleanupTimers.get(turnId);

    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cancelledTurnCleanupTimers.delete(turnId);
    }

    cancelledTurns.delete(turnId);
  }

  return {
    waitForTurn(params: {
      threadId: string;
      turnId: string;
      onDelta?: (params: { delta: string; text: string }) => void;
    }): Promise<CompletedTurnResult> {
      return new Promise<CompletedTurnResult>((resolve, reject) => {
        clearCancelledTurn(params.turnId);
        const existingTurn = pendingTurns.get(params.turnId);

        if (existingTurn) {
          existingTurn.resolve = resolve;
          existingTurn.reject = reject;
          existingTurn.onDelta = params.onDelta;

          if (params.onDelta && existingTurn.text) {
            params.onDelta({
              delta: existingTurn.text,
              text: existingTurn.text
            });
          }

          if (existingTurn.status) {
            pendingTurns.delete(params.turnId);
            resolve({
              threadId: existingTurn.threadId,
              turnId: params.turnId,
              status: existingTurn.status,
              text: existingTurn.text
            });
          }

          return;
        }

        pendingTurns.set(params.turnId, {
          threadId: params.threadId,
          text: "",
          status: null,
          resolve,
          reject,
          onDelta: params.onDelta
        });
      });
    },

    cancelTurn(turnId: string): void {
      cancelledTurns.add(turnId);
      clearTimeout(cancelledTurnCleanupTimers.get(turnId));
      cancelledTurnCleanupTimers.set(
        turnId,
        setTimeout(() => {
          cancelledTurnCleanupTimers.delete(turnId);
          cancelledTurns.delete(turnId);
        }, CANCELLED_TURN_RETENTION_MS)
      );
      const pendingTurn = pendingTurns.get(turnId);
      pendingTurns.delete(turnId);
      pendingTurn?.reject?.(new TurnCancelledError(turnId));
    },

    handleNotification(notification: {
      method: string;
      params?: unknown;
    }): void {
      if (notification.method === "item/agentMessage/delta") {
        const params = notification.params as AgentMessageDeltaNotification;

        if (cancelledTurns.has(params.turnId)) {
          return;
        }

        const pendingTurn = pendingTurns.get(params.turnId);

        if (!pendingTurn) {
          pendingTurns.set(params.turnId, {
            threadId: params.threadId,
            text: params.delta,
            status: null
          });
          return;
        }

        pendingTurn.text += params.delta;
        pendingTurn.onDelta?.({
          delta: params.delta,
          text: pendingTurn.text
        });
        return;
      }

      if (notification.method === "turn/completed") {
        const params = notification.params as TurnCompletedNotification;

        if (cancelledTurns.has(params.turn.id)) {
          return;
        }

        const pendingTurn = pendingTurns.get(params.turn.id);

        if (!pendingTurn) {
          pendingTurns.set(params.turn.id, {
            threadId: params.threadId,
            text: "",
            status: params.turn.status
          });
          return;
        }

        if (!pendingTurn.resolve) {
          pendingTurn.status = params.turn.status;
          return;
        }

        pendingTurns.delete(params.turn.id);
        pendingTurn.resolve({
          threadId: params.threadId,
          turnId: params.turn.id,
          status: params.turn.status,
          text: pendingTurn.text
        });
      }
    }
  };
}
