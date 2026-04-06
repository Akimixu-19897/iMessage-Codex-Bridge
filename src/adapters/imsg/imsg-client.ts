import { createNodeCommandRunner } from "./node-command-runner.js";

export type CommandRunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (
  command: string,
  args: string[]
) => Promise<CommandRunnerResult>;

export type ImsgAvailability = {
  available: boolean;
  executablePath: string | null;
};

export type SendImsgTextMessageParams = {
  to: string;
  text: string;
};

export type WatchImsgMessagesParams = {
  attachments?: boolean;
  json?: boolean;
  participants?: string[];
  sinceRowId?: number;
};

type CreateImsgClientOptions = {
  runCommand?: CommandRunner;
};

export function createImsgClient(options: CreateImsgClientOptions) {
  const runCommand = options.runCommand ?? createNodeCommandRunner();

  return {
    async detectAvailability(): Promise<ImsgAvailability> {
      const result = await runCommand("which", ["imsg"]);

      if (result.exitCode !== 0) {
        return {
          available: false,
          executablePath: null
        };
      }

      return {
        available: true,
        executablePath: result.stdout.trim()
      };
    },

    async sendTextMessage(
      params: SendImsgTextMessageParams
    ): Promise<CommandRunnerResult> {
      return runCommand("imsg", [
        "send",
        "--to",
        params.to,
        "--text",
        params.text,
        "--json"
      ]);
    },

    buildWatchArgs(params: WatchImsgMessagesParams = {}): string[] {
      const args = ["watch"];

      if (params.json ?? true) {
        args.push("--json");
      }

      if (params.attachments) {
        args.push("--attachments");
      }

      if (params.sinceRowId !== undefined) {
        args.push("--since-rowid", String(params.sinceRowId));
      }

      if (params.participants && params.participants.length > 0) {
        args.push("--participants", params.participants.join(","));
      }

      return args;
    }
  };
}
