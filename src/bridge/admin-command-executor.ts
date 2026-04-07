import type {
  BridgeAdminCommand,
  ParsedBridgeAdminCommand
} from "./admin-command.js";

type SessionManager = {
  getSession(handle: string): {
    handle: string;
    name: string;
    workspace: string;
    threadId: string | null;
  };
  listContacts(): Array<{
    handle: string;
    name: string;
    workspace: string;
    threadId: string | null;
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
};

type CreateAdminCommandExecutorOptions = {
  sessionManager: SessionManager;
  saveState: () => Promise<void>;
};

export function createAdminCommandExecutor(
  options: CreateAdminCommandExecutorOptions
) {
  return {
    async execute(command: ParsedBridgeAdminCommand): Promise<string> {
      if (command.type === "invalid") {
        return command.message;
      }

      if (command.type === "help") {
        return [
          "支持命令：",
          "/bridge list",
          "/bridge allow <handle> <name> <workspace>",
          "/bridge workspace <handle> <workspace>",
          "/bridge remove <handle>"
        ].join("\n");
      }

      if (command.type === "list") {
        return formatContactList(options.sessionManager.listContacts());
      }

      return executeStatefulCommand(command, options);
    }
  };
}

async function executeStatefulCommand(
  command: Extract<BridgeAdminCommand, { type: "allow" | "workspace" | "remove" }>,
  options: CreateAdminCommandExecutorOptions
): Promise<string> {
  switch (command.type) {
    case "allow": {
      const contact = options.sessionManager.upsertContact({
        handle: command.handle,
        name: command.name,
        workspace: command.workspace
      });
      await options.saveState();
      return `已保存联系人：${contact.handle} | ${contact.name} | ${contact.workspace}`;
    }
    case "workspace": {
      const existing = options.sessionManager.getSession(command.handle);
      options.sessionManager.upsertContact({
        handle: command.handle,
        name: existing.name,
        workspace: command.workspace
      });
      await options.saveState();
      return `已更新 workspace：${command.handle} -> ${command.workspace}`;
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
    threadId: string | null;
  }>
): string {
  const lines = contacts.map(
    (contact) =>
      `${contact.handle} | ${contact.name} | ${contact.workspace} | thread=${contact.threadId ?? "-"}`
  );

  return ["当前联系人：", ...lines].join("\n");
}
