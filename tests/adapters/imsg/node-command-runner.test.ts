import { describe, expect, test } from "vitest";

import { createNodeCommandRunner } from "../../../src/adapters/imsg/node-command-runner.js";

describe("createNodeCommandRunner", () => {
  test("captures stdout from a successful command", async () => {
    const runCommand = createNodeCommandRunner();

    const result = await runCommand("node", [
      "-e",
      "process.stdout.write('runner-ok')"
    ]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: "runner-ok",
      stderr: ""
    });
  });

  test("captures stderr and exit code from a failed command", async () => {
    const runCommand = createNodeCommandRunner();

    const result = await runCommand("node", [
      "-e",
      "process.stderr.write('runner-fail'); process.exit(3)"
    ]);

    expect(result).toEqual({
      exitCode: 3,
      stdout: "",
      stderr: "runner-fail"
    });
  });
});
