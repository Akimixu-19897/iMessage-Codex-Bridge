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
  resolve: (value: CompletedTurnResult) => void;
};

export type CompletedTurnResult = {
  threadId: string;
  turnId: string;
  status: string;
  text: string;
};

export function createTurnResponseCollector() {
  const pendingTurns = new Map<string, PendingTurn>();

  return {
    waitForTurn(params: { threadId: string; turnId: string }): Promise<CompletedTurnResult> {
      return new Promise<CompletedTurnResult>((resolve) => {
        pendingTurns.set(params.turnId, {
          threadId: params.threadId,
          text: "",
          resolve
        });
      });
    },

    handleNotification(notification: {
      method: string;
      params?: unknown;
    }): void {
      if (notification.method === "item/agentMessage/delta") {
        const params = notification.params as AgentMessageDeltaNotification;
        const pendingTurn = pendingTurns.get(params.turnId);

        if (!pendingTurn) {
          return;
        }

        pendingTurn.text += params.delta;
        return;
      }

      if (notification.method === "turn/completed") {
        const params = notification.params as TurnCompletedNotification;
        const pendingTurn = pendingTurns.get(params.turn.id);

        if (!pendingTurn) {
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
