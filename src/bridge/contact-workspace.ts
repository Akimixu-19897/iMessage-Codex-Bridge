import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_WORKSPACE_ROOT = join(homedir(), ".imessage-codex-agent", "workspace");

export function getDefaultWorkspaceRoot(): string {
  return DEFAULT_WORKSPACE_ROOT;
}

export function resolveDefaultContactWorkspace(handle: string): string {
  return join(DEFAULT_WORKSPACE_ROOT, sanitizeHandleForWorkspace(handle));
}

export async function ensureContactWorkspace(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function sanitizeHandleForWorkspace(handle: string): string {
  const normalized = handle.trim().toLowerCase();
  const sanitized = normalized.replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || "contact";
}
