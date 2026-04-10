export type BridgeAdminCommand =
  | {
      type: "allow";
      handle: string;
      name: string;
      workspace?: string;
    }
  | {
      type: "workspace_default";
    }
  | {
      type: "workspace";
      handle: string;
      workspace: string;
    }
  | {
      type: "remove";
      handle: string;
    }
  | {
      type: "list";
    }
  | {
      type: "help";
    };

export type InvalidBridgeAdminCommand = {
  type: "invalid";
  message: string;
};

export type ParsedBridgeAdminCommand =
  | BridgeAdminCommand
  | InvalidBridgeAdminCommand;

export function parseBridgeAdminCommand(
  text: string
): ParsedBridgeAdminCommand | null {
  const tokens = tokenizeCommand(text);

  if (tokens.length === 0 || tokens[0] !== "/bridge") {
    return null;
  }

  if (tokens.length === 1) {
    return {
      type: "invalid",
      message: "命令不完整，请发送 /bridge help 查看用法。"
    };
  }

  const command = tokens[1];

  switch (command) {
    case "allow":
      if (tokens.length !== 4 && tokens.length !== 5) {
        return {
          type: "invalid",
          message: "allow 命令格式：/bridge allow <handle> <name> [workspace]"
        };
      }

      return {
        type: "allow",
        handle: tokens[2]!,
        name: tokens[3]!,
        workspace: tokens[4]
      };
    case "workspace":
      if (tokens.length === 2) {
        return {
          type: "workspace_default"
        };
      }

      if (tokens.length !== 4) {
        return {
          type: "invalid",
          message:
            "workspace 命令格式：/bridge workspace <handle> <workspace>"
        };
      }

      return {
        type: "workspace",
        handle: tokens[2]!,
        workspace: tokens[3]!
      };
    case "remove":
      if (tokens.length !== 3) {
        return {
          type: "invalid",
          message: "remove 命令格式：/bridge remove <handle>"
        };
      }

      return {
        type: "remove",
        handle: tokens[2]!
      };
    case "list":
      return {
        type: "list"
      };
    case "help":
      return {
        type: "help"
      };
    default:
      return {
        type: "invalid",
        message: "未知命令，请发送 /bridge help 查看用法。"
      };
  }
}

function tokenizeCommand(text: string): string[] {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const tokens: string[] = [];
  const matcher = /"([^"]*)"|'([^']*)'|(\S+)/g;

  for (const match of trimmed.matchAll(matcher)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }

  return tokens.filter((token) => token.length > 0);
}
