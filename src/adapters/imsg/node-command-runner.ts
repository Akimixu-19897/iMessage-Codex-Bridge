import { spawn } from "node:child_process";

import type { CommandRunner, CommandRunnerResult } from "./imsg-client.js";

export function createNodeCommandRunner(): CommandRunner {
  return (command, args) =>
    new Promise<CommandRunnerResult>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout,
          stderr
        });
      });
    });
}
