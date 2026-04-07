import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config/load-config.js";

describe("loadConfig", () => {
  test("loads whitelist contacts and merge window from yaml", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bridge-config-"));
    const configPath = join(directory, "bridge.yaml");

    await writeFile(
      configPath,
      [
        "rejectionMessage: 请联系管理员开通权限。",
        "messageMergeWindowMs: 4000",
        "adminHandles:",
        "  - '+8613700000000'",
        "contacts:",
        "  - handle: '+8613800000000'",
        "    name: 测试联系人",
        "    workspace: '/tmp/workspace-a'"
      ].join("\n"),
      "utf8"
    );

    const config = await loadConfig(configPath);

    expect(config.rejectionMessage).toBe("请联系管理员开通权限。");
    expect(config.messageMergeWindowMs).toBe(4000);
    expect(config.adminHandles).toEqual(["+8613700000000"]);
    expect(config.contacts).toEqual([
      {
        handle: "+8613800000000",
        name: "测试联系人",
        workspace: "/tmp/workspace-a"
      }
    ]);
  });
});
