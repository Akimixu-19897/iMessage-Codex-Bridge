import { spawn } from "node:child_process";

type EventedProcessStdout = {
  on: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
};

type SpawnedProcess = {
  stdout: EventedProcessStdout;
  stderr: unknown;
  kill: () => void;
};

type SpawnProcess = (command: string, args: string[]) => SpawnedProcess;

type CreateImsgWatchHostOptions = {
  executablePath: string;
  watchArgs: string[];
  spawnProcess?: SpawnProcess;
};

type StartImsgWatchSessionOptions = {
  onChunk: (chunk: string) => void;
};

export function createImsgWatchHost(options: CreateImsgWatchHostOptions) {
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess;

  return {
    start(sessionOptions: StartImsgWatchSessionOptions) {
      const childProcess = spawnProcess(
        options.executablePath,
        options.watchArgs
      );

      childProcess.stdout.on("data", (chunk: Buffer | string) => {
        sessionOptions.onChunk(chunk.toString());
      });

      return {
        close(): void {
          childProcess.kill();
        }
      };
    }
  };
}

function defaultSpawnProcess(command: string, args: string[]) {
  return spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"]
  });
}
