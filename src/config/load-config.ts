import { readFile } from "node:fs/promises";

import { parse } from "yaml";

import { bridgeConfigSchema, type BridgeConfig } from "./schema.js";

export async function loadConfig(configPath: string): Promise<BridgeConfig> {
  const rawContent = await readFile(configPath, "utf8");
  const parsed = parse(rawContent);

  return bridgeConfigSchema.parse(parsed);
}
