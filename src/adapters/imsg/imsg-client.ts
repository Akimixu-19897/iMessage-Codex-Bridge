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

type CreateImsgClientOptions = {
  runCommand: CommandRunner;
};

export function createImsgClient(options: CreateImsgClientOptions) {
  return {
    async detectAvailability(): Promise<ImsgAvailability> {
      const result = await options.runCommand("which", ["imsg"]);

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
    }
  };
}
