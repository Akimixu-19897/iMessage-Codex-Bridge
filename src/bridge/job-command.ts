export type BridgeJobCommand =
  | {
      type: "task";
      prompt: string;
    }
  | {
      type: "research";
      goal: string;
    }
  | {
      type: "jobs";
    }
  | {
      type: "status";
      jobId: string;
    }
  | {
      type: "cancel";
      jobId: string;
    }
  | {
      type: "logs";
      jobId: string;
    };

export type InvalidBridgeJobCommand = {
  type: "invalid";
  message: string;
};

export type ParsedBridgeJobCommand = BridgeJobCommand | InvalidBridgeJobCommand;

export function parseBridgeJobCommand(text: string): ParsedBridgeJobCommand | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed === "/jobs" || trimmed === "任务列表") {
    return { type: "jobs" };
  }

  if (trimmed.startsWith("/research ")) {
    const goal = trimmed.slice(10).trim();
    return goal
      ? {
          type: "research",
          goal
        }
      : {
          type: "invalid",
          message: "research 命令格式：/research <目标>"
        };
  }

  if (trimmed === "/research") {
    return {
      type: "invalid",
      message: "research 命令格式：/research <目标>"
    };
  }

  if (trimmed.startsWith("/task ")) {
    const prompt = trimmed.slice(6).trim();
    return prompt
      ? {
          type: "task",
          prompt
        }
      : {
          type: "invalid",
          message: "task 命令格式：/task <内容>"
        };
  }

  if (trimmed === "/task") {
    return {
      type: "invalid",
      message: "task 命令格式：/task <内容>"
    };
  }

  if (trimmed.startsWith("/status ")) {
    return parseJobIdCommand("status", trimmed.slice(8).trim(), "/status <任务编号>");
  }

  if (trimmed.startsWith("任务状态 ")) {
    return parseJobIdCommand("status", trimmed.slice(5).trim(), "任务状态 <任务编号>");
  }

  if (trimmed.startsWith("/cancel ")) {
    return parseJobIdCommand("cancel", trimmed.slice(8).trim(), "/cancel <任务编号>");
  }

  if (trimmed.startsWith("取消任务 ")) {
    return parseJobIdCommand("cancel", trimmed.slice(5).trim(), "取消任务 <任务编号>");
  }

  if (trimmed.startsWith("/logs ")) {
    return parseJobIdCommand("logs", trimmed.slice(6).trim(), "/logs <任务编号>");
  }

  if (trimmed.startsWith("任务日志 ")) {
    return parseJobIdCommand("logs", trimmed.slice(5).trim(), "任务日志 <任务编号>");
  }

  return null;
}

function parseJobIdCommand(
  type: "status" | "cancel" | "logs",
  rawJobId: string,
  usage: string
): ParsedBridgeJobCommand {
  const jobId = rawJobId.trim();

  if (!jobId) {
    return {
      type: "invalid",
      message: `${type} 命令格式：${usage}`
    };
  }

  return {
    type,
    jobId
  };
}

const LONG_TASK_KEYWORDS = [
  "codex-autoresearch",
  "持续",
  "后台",
  "不间断",
  "一直执行",
  "持续研究",
  "跑完所有测试",
  "遍历整个仓库",
  "全量修复",
  "几个小时",
  "不要停",
  "直到完成"
];

export function isLongTaskText(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  const normalized = text.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return LONG_TASK_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );
}

export function usesAutoresearchWorkflow(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  const normalized = text.trim().toLowerCase();

  return (
    normalized.includes("codex-autoresearch") || normalized.startsWith("/research ")
  );
}
