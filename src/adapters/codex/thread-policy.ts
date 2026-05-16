type ResolveThreadPolicyParams = {
  handle: string;
  workspace: string;
  adminHandles: string[];
};

type ThreadPolicy = {
  approvalPolicy: "never";
  sandbox: "workspace-write" | "danger-full-access";
  developerInstructions: string;
};

export function resolveThreadPolicy(params: ResolveThreadPolicyParams): ThreadPolicy {
  if (isAdminHandle(params.handle, params.adminHandles)) {
    return {
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      developerInstructions: [
        "当前联系人是管理员。",
        "允许执行任何本机读写、增删改查与命令操作。",
        "如用户明确要求，可直接处理 workspace 外部文件与系统级操作。"
      ].join("")
    };
  }

  return {
    approvalPolicy: "never",
    sandbox: "workspace-write",
    developerInstructions: [
      "当前联系人不是管理员。",
      `你只允许在自己的 workspace 目录内工作：${params.workspace}。`,
      "workspace 目录内允许增删改查。",
      "严禁对 workspace 之外的任何路径执行读取、搜索、列目录、修改、删除、移动、复制、重命名、创建文件或运行会影响外部路径的命令。",
      "如果用户请求涉及 workspace 外部，必须拒绝并明确说明只允许操作自己的 workspace。"
    ].join("")
  };
}

function isAdminHandle(handle: string, adminHandles: string[]): boolean {
  return adminHandles.some(
    (adminHandle) => normalizeHandle(adminHandle) === normalizeHandle(handle)
  );
}

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}
