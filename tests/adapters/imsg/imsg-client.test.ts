import { describe, expect, test } from "vitest";

import {
  createImsgClient,
  type CommandRunnerResult
} from "../../../src/adapters/imsg/imsg-client.js";

describe("createImsgClient", () => {
  test("reports imsg as available when lookup succeeds", async () => {
    const calls: string[][] = [];
    const client = createImsgClient({
      runCommand: async (command, args): Promise<CommandRunnerResult> => {
        calls.push([command, ...args]);
        return {
          exitCode: 0,
          stdout: "/usr/local/bin/imsg\n",
          stderr: ""
        };
      }
    });

    await expect(client.detectAvailability()).resolves.toEqual({
      available: true,
      executablePath: "/usr/local/bin/imsg"
    });
    expect(calls).toEqual([["which", "imsg"]]);
  });

  test("reports imsg as unavailable when lookup fails", async () => {
    const client = createImsgClient({
      runCommand: async (): Promise<CommandRunnerResult> => ({
        exitCode: 1,
        stdout: "",
        stderr: "imsg not found"
      })
    });

    await expect(client.detectAvailability()).resolves.toEqual({
      available: false,
      executablePath: null
    });
  });

  test("builds watch arguments for attachments and participants", () => {
    const client = createImsgClient({
      runCommand: async (): Promise<CommandRunnerResult> => ({
        exitCode: 0,
        stdout: "",
        stderr: ""
      })
    });

    expect(
      client.buildWatchArgs({
        attachments: true,
        participants: ["+8613800000000", "+8613900000000"],
        sinceRowId: 123
      })
    ).toEqual([
      "watch",
      "--json",
      "--attachments",
      "--since-rowid",
      "123",
      "--participants",
      "+8613800000000,+8613900000000"
    ]);
  });

  test("sends a text message through imsg send", async () => {
    const calls: string[][] = [];
    const client = createImsgClient({
      runCommand: async (command, args): Promise<CommandRunnerResult> => {
        calls.push([command, ...args]);
        return {
          exitCode: 0,
          stdout: '{"ok":true}',
          stderr: ""
        };
      }
    });

    const result = await client.sendTextMessage({
      to: "+8613800000000",
      text: "你好"
    });

    expect(calls).toEqual([
      ["imsg", "send", "--to", "+8613800000000", "--text", "你好", "--json"]
    ]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: ""
    });
  });
});
