import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import type { BridgeConfig, ContactConfig } from "../config/schema.js";

const contactSessionStateSchema = z.object({
  handle: z.string().min(1),
  name: z.string().min(1),
  workspace: z.string().min(1),
  threadId: z.string().min(1).nullable(),
  lastActiveAt: z.number().int().nonnegative().nullable()
});

const processedMessageStateSchema = z.object({
  messageId: z.string().min(1),
  handle: z.string().min(1),
  receivedAt: z.number().int().nonnegative(),
  processedAt: z.number().int().nonnegative()
});

const outboundMessageStateSchema = z.object({
  messageId: z.string().min(1),
  handle: z.string().min(1),
  sentAt: z.number().int().nonnegative()
});

const attachmentRecordStateSchema = z.object({
  messageId: z.string().min(1),
  handle: z.string().min(1),
  threadId: z.string().min(1).nullable(),
  sourcePath: z.string().min(1),
  stagedPath: z.string().min(1),
  createdAt: z.number().int().nonnegative()
});

export const bridgeStateSchema = z.object({
  version: z.literal(1),
  contacts: z.array(contactSessionStateSchema),
  processedMessages: z.array(processedMessageStateSchema),
  outboundMessages: z.array(outboundMessageStateSchema),
  attachments: z.array(attachmentRecordStateSchema)
});

export type ContactSessionState = z.infer<typeof contactSessionStateSchema>;
export type ProcessedMessageState = z.infer<typeof processedMessageStateSchema>;
export type OutboundMessageState = z.infer<typeof outboundMessageStateSchema>;
export type AttachmentRecordState = z.infer<typeof attachmentRecordStateSchema>;
export type BridgeState = z.infer<typeof bridgeStateSchema>;

function createContactState(contact: ContactConfig): ContactSessionState {
  return {
    handle: contact.handle,
    name: contact.name,
    workspace: contact.workspace,
    threadId: null,
    lastActiveAt: null
  };
}

export function createInitialBridgeState(config: BridgeConfig): BridgeState {
  return {
    version: 1,
    contacts: config.contacts.map(createContactState),
    processedMessages: [],
    outboundMessages: [],
    attachments: []
  };
}

type LoadBridgeStateOptions = {
  path: string;
  config: BridgeConfig;
};

export async function loadBridgeState(
  options: LoadBridgeStateOptions
): Promise<BridgeState> {
  try {
    const rawContent = await readFile(options.path, "utf8");
    const parsedJson: unknown = JSON.parse(rawContent);
    return bridgeStateSchema.parse(parsedJson);
  } catch (error) {
    if (isMissingFileError(error)) {
      return createInitialBridgeState(options.config);
    }

    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new Error(`状态文件无效，请人工修复后重试: ${options.path}`, {
        cause: error
      });
    }

    throw error;
  }
}

type SaveBridgeStateOptions = {
  path: string;
  state: BridgeState;
};

export async function saveBridgeState(
  options: SaveBridgeStateOptions
): Promise<void> {
  const serializedState = JSON.stringify(
    bridgeStateSchema.parse(options.state),
    null,
    2
  );

  await mkdir(dirname(options.path), { recursive: true });
  await writeFile(options.path, `${serializedState}\n`, "utf8");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
