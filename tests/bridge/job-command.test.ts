import { describe, expect, test } from "vitest";

import { isLongTaskText, parseBridgeJobCommand } from "../../src/bridge/job-command.js";

describe("parseBridgeJobCommand", () => {
  test("parses task and list commands", () => {
    expect(parseBridgeJobCommand("/task 持续分析这个项目")).toEqual({
      type: "task",
      prompt: "持续分析这个项目"
    });
    expect(parseBridgeJobCommand("/research 修复这个仓库里的测试问题")).toEqual({
      type: "research",
      goal: "修复这个仓库里的测试问题"
    });
    expect(parseBridgeJobCommand("/jobs")).toEqual({
      type: "jobs"
    });
    expect(parseBridgeJobCommand("任务列表")).toEqual({
      type: "jobs"
    });
  });

  test("parses status cancel and logs commands", () => {
    expect(parseBridgeJobCommand("/status job-1")).toEqual({
      type: "status",
      jobId: "job-1"
    });
    expect(parseBridgeJobCommand("取消任务 job-2")).toEqual({
      type: "cancel",
      jobId: "job-2"
    });
    expect(parseBridgeJobCommand("/logs job-3")).toEqual({
      type: "logs",
      jobId: "job-3"
    });
  });

  test("returns invalid metadata for malformed job commands", () => {
    expect(parseBridgeJobCommand("/task")).toEqual({
      type: "invalid",
      message: "task 命令格式：/task <内容>"
    });
    expect(parseBridgeJobCommand("/research")).toEqual({
      type: "invalid",
      message: "research 命令格式：/research <目标>"
    });
    expect(parseBridgeJobCommand("普通消息")).toBeNull();
  });
});

describe("isLongTaskText", () => {
  test("detects long task keywords", () => {
    expect(isLongTaskText("请用 codex-autoresearch 持续研究整个仓库")).toBe(true);
    expect(isLongTaskText("这个问题先简单回答一下")).toBe(false);
  });
});
