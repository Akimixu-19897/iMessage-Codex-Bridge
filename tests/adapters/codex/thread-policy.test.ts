import { describe, expect, test } from "vitest";

import { resolveThreadPolicy } from "../../../src/adapters/codex/thread-policy.js";

describe("resolveThreadPolicy", () => {
  test("grants administrators danger-full-access", () => {
    expect(
      resolveThreadPolicy({
        handle: "Qiushi.Xu@ks.casetekcorp.com",
        workspace: "/tmp/workspace-a",
        adminHandles: ["qiushi.xu@ks.casetekcorp.com"]
      })
    ).toEqual({
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      developerInstructions: expect.stringContaining("当前联系人是管理员。")
    });
  });

  test("restricts non-admin contacts to their own workspace", () => {
    const policy = resolveThreadPolicy({
      handle: "+8613800000000",
      workspace: "/tmp/workspace-a",
      adminHandles: ["+8613900000000"]
    });

    expect(policy.approvalPolicy).toBe("never");
    expect(policy.sandbox).toBe("workspace-write");
    expect(policy.developerInstructions).toContain(
      "你只允许在自己的 workspace 目录内工作：/tmp/workspace-a。"
    );
    expect(policy.developerInstructions).toContain(
      "严禁对 workspace 之外的任何路径执行读取、搜索、列目录、修改、删除、移动、复制、重命名、创建文件或运行会影响外部路径的命令。"
    );
  });
});
