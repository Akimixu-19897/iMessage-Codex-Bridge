export type BridgeSessionCommand =
  | {
      type: "help";
    }
  | {
      type: "new";
      name?: string;
    }
  | {
      type: "list";
    }
  | {
      type: "current";
    }
  | {
      type: "switch";
      index: number;
    };

export type InvalidBridgeSessionCommand = {
  type: "invalid";
  message: string;
};

export type ParsedBridgeSessionCommand =
  | BridgeSessionCommand
  | InvalidBridgeSessionCommand;

export function parseBridgeSessionCommand(
  text: string
): ParsedBridgeSessionCommand | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed === "/help" || trimmed === "帮助" || trimmed === "命令") {
    return { type: "help" };
  }

  if (trimmed === "/list" || trimmed === "会话列表") {
    return { type: "list" };
  }

  if (trimmed === "/current" || trimmed === "当前会话") {
    return { type: "current" };
  }

  if (trimmed === "/new" || trimmed === "新任务" || trimmed === "新建会话") {
    return { type: "new", name: undefined };
  }

  if (trimmed.startsWith("/new ")) {
    return {
      type: "new",
      name: trimmed.slice(5).trim() || undefined
    };
  }

  if (trimmed.startsWith("新任务 ")) {
    return {
      type: "new",
      name: trimmed.slice(4).trim() || undefined
    };
  }

  if (trimmed.startsWith("新建会话 ")) {
    return {
      type: "new",
      name: trimmed.slice(5).trim() || undefined
    };
  }

  if (trimmed === "/switch") {
    return {
      type: "invalid",
      message: "switch 命令格式：/switch <编号>"
    };
  }

  if (trimmed.startsWith("/switch ")) {
    return parseSwitchIndex(trimmed.slice(8).trim());
  }

  if (trimmed.startsWith("切换会话 ")) {
    return parseSwitchIndex(trimmed.slice(5).trim());
  }

  return null;
}

function parseSwitchIndex(rawIndex: string): ParsedBridgeSessionCommand {
  const index = Number.parseInt(rawIndex, 10);

  if (!Number.isInteger(index) || index <= 0) {
    return {
      type: "invalid",
      message: "会话编号必须是正整数。"
    };
  }

  return {
    type: "switch",
    index
  };
}
