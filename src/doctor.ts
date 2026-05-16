import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import {
  createImsgClient,
  type ImsgAvailability
} from "./adapters/imsg/imsg-client.js";
import { createNodeCommandRunner } from "./adapters/imsg/node-command-runner.js";
import type { BridgeConfig } from "./config/schema.js";
import { loadConfig as defaultLoadConfig } from "./config/load-config.js";

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
};

type RunDoctorOptions = {
  configPath: string;
  statePath: string;
  attachmentDirectory: string;
  loadConfig?: (configPath: string) => Promise<BridgeConfig>;
  detectImsgAvailability?: () => Promise<ImsgAvailability>;
  detectCodexAvailability?: () => Promise<boolean>;
  ensureDirectory?: (path: string) => Promise<void>;
};

export async function runDoctor(options: RunDoctorOptions): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const loadConfig = options.loadConfig ?? defaultLoadConfig;
  const ensureDirectory =
    options.ensureDirectory ??
    ((path) => mkdir(path, { recursive: true }).then(() => undefined));
  let config: BridgeConfig | null = null;

  try {
    config = await loadConfig(options.configPath);
    checks.push({
      name: "config",
      ok: true,
      detail: options.configPath
    });
  } catch (error) {
    checks.push({
      name: "config",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }

  const imsgAvailability = await (
    options.detectImsgAvailability ?? (() => createImsgClient({}).detectAvailability())
  )();
  checks.push({
    name: "imsg",
    ok: imsgAvailability.available,
    detail: imsgAvailability.executablePath ?? "未找到 imsg"
  });

  const codexAvailable = await (
    options.detectCodexAvailability ?? detectCodexAvailability
  )();
  checks.push({
    name: "codex",
    ok: codexAvailable,
    detail: codexAvailable ? "codex app-server 可用" : "codex app-server 不可用"
  });

  await pushDirectoryCheck(
    checks,
    "state",
    dirname(options.statePath),
    options.statePath,
    ensureDirectory
  );
  await pushDirectoryCheck(
    checks,
    "attachments",
    options.attachmentDirectory,
    options.attachmentDirectory,
    ensureDirectory
  );

  if (config) {
    for (const contact of config.contacts) {
      await pushDirectoryCheck(
        checks,
        "workspace",
        contact.workspace,
        contact.workspace,
        ensureDirectory
      );
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}

export function formatDoctorResult(result: DoctorResult): string {
  return result.checks
    .map((check) => `${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`)
    .join("\n");
}

async function pushDirectoryCheck(
  checks: DoctorCheck[],
  name: string,
  directory: string,
  detail: string,
  ensureDirectory: (path: string) => Promise<void>
): Promise<void> {
  try {
    await ensureDirectory(directory);
    checks.push({
      name,
      ok: true,
      detail
    });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

async function detectCodexAvailability(): Promise<boolean> {
  const result = await createNodeCommandRunner()("which", ["codex"]);
  return result.exitCode === 0;
}
