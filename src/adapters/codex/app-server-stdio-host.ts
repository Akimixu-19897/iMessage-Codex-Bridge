import { spawn } from "node:child_process";

import {
  createStdioJsonRpc,
  type JsonRpcNotification
} from "../../transport/stdio-json-rpc.js";

type WritableProcessStdin = {
  write: (chunk: string, callback?: (error?: Error | null) => void) => boolean;
};

type EventedProcessStdout = {
  on: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
};

type SpawnedProcess = {
  stdin: WritableProcessStdin;
  stdout: EventedProcessStdout;
  stderr: unknown;
  kill: () => void;
};

type SpawnProcess = (command: string, args: string[]) => SpawnedProcess;

type CreateAppServerStdioHostOptions = {
  command?: string;
  args?: string[];
  spawnProcess?: SpawnProcess;
  nextRequestId?: () => number;
  onNotification?: (notification: JsonRpcNotification) => void;
};

export function createAppServerStdioHost(
  options: CreateAppServerStdioHostOptions = {}
) {
  const spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
  const command = options.command ?? "codex";
  const args = options.args ?? ["app-server", "--listen", "stdio://"];

  return {
    start() {
      const childProcess = spawnProcess(command, args);
      const transport = createStdioJsonRpc({
        writeChunk: (chunk) =>
          new Promise<void>((resolve, reject) => {
            childProcess.stdin.write(chunk, (error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            });
          }),
        nextRequestId: options.nextRequestId,
        onNotification: options.onNotification
      });

      childProcess.stdout.on("data", (chunk: Buffer | string) => {
        transport.pushStdoutChunk(chunk.toString());
      });

      const initialized = transport
        .request("initialize", {
          clientInfo: {
            name: "imessage-codex-bridge",
            title: "iMessage Codex Bridge",
            version: "0.1.0"
          },
          capabilities: {
            experimentalApi: true,
            optOutNotificationMethods: []
          }
        })
        .then(async () => {
          await transport.notify("initialized");
        });

      return {
        async request(method: string, params?: unknown): Promise<unknown> {
          await initialized;
          return transport.request(method, params);
        },

        close(): void {
          childProcess.kill();
        }
      };
    }
  };
}

function defaultSpawnProcess(command: string, args: string[]) {
  return spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"]
  });
}
