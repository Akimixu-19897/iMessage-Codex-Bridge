import { describe, expect, test } from "vitest";

import { parseBridgeSessionCommand } from "../../src/bridge/session-command.js";

describe("parseBridgeSessionCommand", () => {
  test("parses new commands with optional names", () => {
    expect(parseBridgeSessionCommand("/new")).toEqual({
      type: "new",
      name: undefined
    });
    expect(parseBridgeSessionCommand("/new 重构支付")).toEqual({
      type: "new",
      name: "重构支付"
    });
    expect(parseBridgeSessionCommand("新建会话 支付重构")).toEqual({
      type: "new",
      name: "支付重构"
    });
  });

  test("parses list, current, and switch commands", () => {
    expect(parseBridgeSessionCommand("/help")).toEqual({
      type: "help"
    });
    expect(parseBridgeSessionCommand("帮助")).toEqual({
      type: "help"
    });
    expect(parseBridgeSessionCommand("/list")).toEqual({
      type: "list"
    });
    expect(parseBridgeSessionCommand("会话列表")).toEqual({
      type: "list"
    });
    expect(parseBridgeSessionCommand("/current")).toEqual({
      type: "current"
    });
    expect(parseBridgeSessionCommand("当前会话")).toEqual({
      type: "current"
    });
    expect(parseBridgeSessionCommand("/switch 2")).toEqual({
      type: "switch",
      index: 2
    });
    expect(parseBridgeSessionCommand("切换会话 3")).toEqual({
      type: "switch",
      index: 3
    });
  });

  test("returns invalid metadata for malformed switch commands", () => {
    expect(parseBridgeSessionCommand("/switch")).toEqual({
      type: "invalid",
      message: "switch 命令格式：/switch <编号>"
    });
    expect(parseBridgeSessionCommand("/switch abc")).toEqual({
      type: "invalid",
      message: "会话编号必须是正整数。"
    });
    expect(parseBridgeSessionCommand("普通消息")).toBeNull();
  });
});
