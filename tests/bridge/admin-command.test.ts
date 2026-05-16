import { describe, expect, test } from "vitest";

import { parseBridgeAdminCommand } from "../../src/bridge/admin-command.js";

describe("parseBridgeAdminCommand", () => {
  test("parses allow commands with quoted name and workspace", () => {
    expect(
      parseBridgeAdminCommand(
        '/bridge allow +8613900000000 "联系人 B" "/tmp/workspace b"'
      )
    ).toEqual({
      type: "allow",
      handle: "+8613900000000",
      name: "联系人 B",
      workspace: "/tmp/workspace b"
    });
  });

  test("parses list, workspace, remove, and help commands", () => {
    expect(parseBridgeAdminCommand("/bridge list")).toEqual({
      type: "list"
    });
    expect(parseBridgeAdminCommand("/bridge workspace")).toEqual({
      type: "workspace_default"
    });
    expect(
      parseBridgeAdminCommand('/bridge workspace +8613900000000 "/tmp/new workspace"')
    ).toEqual({
      type: "workspace",
      handle: "+8613900000000",
      workspace: "/tmp/new workspace"
    });
    expect(parseBridgeAdminCommand("/bridge remove +8613900000000")).toEqual({
      type: "remove",
      handle: "+8613900000000"
    });
    expect(parseBridgeAdminCommand("/bridge help")).toEqual({
      type: "help"
    });
  });

  test("returns invalid metadata for malformed commands", () => {
    expect(parseBridgeAdminCommand("/bridge")).toEqual({
      type: "invalid",
      message: "命令不完整，请发送 /bridge help 查看用法。"
    });
    expect(parseBridgeAdminCommand("/bridge allow only-two-args")).toEqual({
      type: "invalid",
      message: "allow 命令格式：/bridge allow <handle> <name> [workspace]"
    });
    expect(parseBridgeAdminCommand("普通消息")).toBeNull();
  });

  test("parses allow commands without explicit workspace", () => {
    expect(
      parseBridgeAdminCommand("/bridge allow Qiushi.Xu@ks.casetekcorp.com lux-80531901")
    ).toEqual({
      type: "allow",
      handle: "Qiushi.Xu@ks.casetekcorp.com",
      name: "lux-80531901",
      workspace: undefined
    });
  });
});
