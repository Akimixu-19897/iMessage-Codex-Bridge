import type { BridgeAdminCommand, ParsedBridgeAdminCommand } from "./admin-command.js";
import {
  ensureContactWorkspace,
  getDefaultWorkspaceRoot,
  resolveDefaultContactWorkspace
} from "./contact-workspace.js";

type SessionManager = {
  getContact(handle: string): {
    handle: string;
    name: string;
    workspace: string;
    currentSessionId: string | null;
    sessions: Array<{
      id: string;
      threadId: string | null;
    }>;
  };
  listContacts(): Array<{
    handle: string;
    name: string;
    workspace: string;
    currentSessionId: string | null;
    sessions: Array<{
      id: string;
      threadId: string | null;
    }>;
  }>;
  upsertContact(params: { handle: string; name: string; workspace: string }): {
    handle: string;
    name: string;
    workspace: string;
  };
  removeContact(handle: string): {
    handle: string;
    name: string;
  };
  updateWorkspace(params: { handle: string; workspace: string }): {
    currentSessionId: string | null;
  };
};

type CreateAdminCommandExecutorOptions = {
  sessionManager: SessionManager;
  saveState: () => Promise<void>;
  ensureWorkspaceDirectory?: (path: string) => Promise<void>;
  resolveWorkspaceForHandle?: (handle: string) => string;
};

export function createAdminCommandExecutor(options: CreateAdminCommandExecutorOptions) {
  const ensureWorkspaceDirectory =
    options.ensureWorkspaceDirectory ?? ensureContactWorkspace;
  const resolveWorkspaceForHandle =
    options.resolveWorkspaceForHandle ?? resolveDefaultContactWorkspace;

  return {
    async execute(
      command: ParsedBridgeAdminCommand,
      actorHandle?: string
    ): Promise<string> {
      if (command.type === "invalid") {
        return command.message;
      }

      if (command.type === "help") {
        return formatAdminHelp();
      }

      if (command.type === "list") {
        return formatContactList(options.sessionManager.listContacts());
      }

      return executeStatefulCommand(command, {
        ...options,
        actorHandle,
        ensureWorkspaceDirectory,
        resolveWorkspaceForHandle
      });
    }
  };
}

function formatAdminHelp(): string {
  return [
    "Bridge 管理命令：",
    "",
    "1. /bridge list",
    "查看当前白名单联系人、workspace 和会话数量。",
    "",
    "2. /bridge allow <handle> <name> [workspace]",
    "添加或更新一个联系人。handle 是手机号或 iMessage 邮箱；name 是备注名；workspace 是这个联系人默认操作目录。",
    `不传 workspace 时，会自动使用默认目录：${getDefaultWorkspaceRoot()}/<handle>`,
    '示例：/bridge allow "user@example.com" "张三" "/Users/akimixu/project-a"',
    "",
    "3. /bridge workspace <handle> <workspace>",
    "修改某个联系人的默认 workspace。已有当前会话会在下一条消息时用新目录重新开线程。",
    '示例：/bridge workspace "user@example.com" "/Users/akimixu/project-b"',
    "",
    "4. /bridge workspace",
    "把你自己的 workspace 恢复成默认目录，适合管理员把自己从临时项目切回来。",
    "",
    "5. /bridge remove <handle>",
    "从白名单移除联系人。移除后该联系人不能再使用 Codex bridge。",
    '示例：/bridge remove "user@example.com"',
    "",
    "白名单联系人也可使用：",
    "/new [名称]：新建并切换会话",
    "/list：查看自己的会话列表",
    "/current：查看当前会话",
    "/switch <编号>：切换到指定会话",
    "/task <内容>：启动后台任务",
    "/research <目标>：启动 autoresearch 研究任务",
    "/jobs：查看自己的任务列表",
    "/status <任务编号>：查看任务状态",
    "/cancel <任务编号>：取消任务",
    "/logs <任务编号>：查看任务日志",
    "",
    "提示：参数里有空格时请用英文引号包起来。"
  ].join("\n");
}

async function executeStatefulCommand(
  command: Extract<
    BridgeAdminCommand,
    { type: "allow" | "workspace" | "workspace_default" | "remove" }
  >,
  options: CreateAdminCommandExecutorOptions & {
    actorHandle?: string;
    ensureWorkspaceDirectory: (path: string) => Promise<void>;
    resolveWorkspaceForHandle: (handle: string) => string;
  }
): Promise<string> {
  switch (command.type) {
    case "allow": {
      const workspace =
        command.workspace ?? options.resolveWorkspaceForHandle(command.handle);
      await options.ensureWorkspaceDirectory(workspace);
      const contact = options.sessionManager.upsertContact({
        handle: command.handle,
        name: command.name,
        workspace
      });
      await options.saveState();
      return `已保存联系人：${contact.handle} | ${contact.name} | ${contact.workspace}`;
    }
    case "workspace_default": {
      if (!options.actorHandle) {
        return "workspace 命令格式：/bridge workspace <handle> <workspace>";
      }

      const workspace = options.resolveWorkspaceForHandle(options.actorHandle);
      await options.ensureWorkspaceDirectory(workspace);
      const updated = options.sessionManager.updateWorkspace({
        handle: options.actorHandle,
        workspace
      });
      await options.saveState();
      return updated.currentSessionId
        ? `已更新 workspace：${options.actorHandle} -> ${workspace}（当前会话将在新目录启动）`
        : `已更新 workspace：${options.actorHandle} -> ${workspace}`;
    }
    case "workspace": {
      await options.ensureWorkspaceDirectory(command.workspace);
      const updated = options.sessionManager.updateWorkspace({
        handle: command.handle,
        workspace: command.workspace
      });
      await options.saveState();
      return updated.currentSessionId
        ? `已更新 workspace：${command.handle} -> ${command.workspace}（当前会话将在新目录启动）`
        : `已更新 workspace：${command.handle} -> ${command.workspace}`;
    }
    case "remove": {
      const removed = options.sessionManager.removeContact(command.handle);
      await options.saveState();
      return `已移除联系人：${removed.handle}`;
    }
  }
}

function formatContactList(
  contacts: Array<{
    handle: string;
    name: string;
    workspace: string;
    currentSessionId: string | null;
    sessions?: Array<{
      id: string;
      threadId: string | null;
    }>;
  }>
): string {
  const lines = contacts.map(
    (contact) =>
      `${contact.handle} | ${contact.name} | ${contact.workspace} | current=${contact.currentSessionId ?? "-"} | sessions=${contact.sessions?.length ?? 0}`
  );

  return ["当前联系人：", ...lines].join("\n");
}
