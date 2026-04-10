import type {
  BridgeAdminCommand,
  ParsedBridgeAdminCommand
} from "./admin-command.js";
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
  upsertContact(params: {
    handle: string;
    name: string;
    workspace: string;
  }): {
    handle: string;
    name: string;
    workspace: string;
  };
  removeContact(handle: string): {
    handle: string;
    name: string;
  };
  updateWorkspace(params: {
    handle: string;
    workspace: string;
  }): {
    currentSessionId: string | null;
  };
};

type CreateAdminCommandExecutorOptions = {
  sessionManager: SessionManager;
  saveState: () => Promise<void>;
  ensureWorkspaceDirectory?: (path: string) => Promise<void>;
  resolveWorkspaceForHandle?: (handle: string) => string;
};

export function createAdminCommandExecutor(
  options: CreateAdminCommandExecutorOptions
) {
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
        return [
          "支持命令：",
          "/bridge list",
          `/bridge allow <handle> <name> [workspace]（默认：${getDefaultWorkspaceRoot()}/<handle>）`,
          "/bridge workspace <handle> <workspace>",
          "/bridge remove <handle>"
        ].join("\n");
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
