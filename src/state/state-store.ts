import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import type { BridgeConfig, ContactConfig } from "../config/schema.js";

const contactSessionStateSchema = z.object({
  handle: z.string().min(1),
  name: z.string().min(1),
  workspace: z.string().min(1),
  currentSessionId: z.string().min(1).nullable(),
  sessions: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      workspace: z.string().min(1),
      threadId: z.string().min(1).nullable(),
      lastActiveAt: z.number().int().nonnegative().nullable(),
      createdAt: z.number().int().nonnegative()
    })
  )
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

const jobLogEntryStateSchema = z.object({
  at: z.number().int().nonnegative(),
  message: z.string().min(1)
});

const backgroundJobStateSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1),
  sessionId: z.string().min(1).nullable(),
  mode: z.enum(["foreground", "background"]),
  workflow: z.enum(["generic", "autoresearch"]).default("generic"),
  prompt: z.string().min(1),
  title: z.string().min(1),
  sourceMessageIds: z.array(z.string().min(1)).default([]),
  attachmentPaths: z.array(z.string().min(1)),
  status: z.enum([
    "queued",
    "running",
    "waiting_input",
    "completed",
    "failed",
    "cancelled"
  ]),
  createdAt: z.number().int().nonnegative(),
  acknowledgedAt: z.number().int().nonnegative().nullable().default(null),
  updatedAt: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative().nullable(),
  finishedAt: z.number().int().nonnegative().nullable(),
  currentStage: z.string().min(1).nullable(),
  summary: z.string().min(1).nullable(),
  errorMessage: z.string().min(1).nullable(),
  threadId: z.string().min(1).nullable(),
  turnId: z.string().min(1).nullable(),
  lastHeartbeatAt: z.number().int().nonnegative().nullable(),
  nextHeartbeatAt: z.number().int().nonnegative().nullable(),
  slowNoticeSentAt: z.number().int().nonnegative().nullable(),
  logs: z.array(jobLogEntryStateSchema)
});

const legacyContactStateSchema = z.object({
  handle: z.string().min(1),
  name: z.string().min(1),
  workspace: z.string().min(1),
  threadId: z.string().min(1).nullable(),
  lastActiveAt: z.number().int().nonnegative().nullable()
});

const legacyBridgeStateSchema = z.object({
  version: z.literal(1),
  contacts: z.array(legacyContactStateSchema),
  processedMessages: z.array(processedMessageStateSchema),
  outboundMessages: z.array(outboundMessageStateSchema),
  attachments: z.array(attachmentRecordStateSchema)
});

export const bridgeStateSchema = z.object({
  version: z.literal(3),
  contacts: z.array(contactSessionStateSchema),
  processedMessages: z.array(processedMessageStateSchema),
  outboundMessages: z.array(outboundMessageStateSchema),
  attachments: z.array(attachmentRecordStateSchema),
  nextJobSequence: z.number().int().positive(),
  jobs: z.array(backgroundJobStateSchema)
});

export type ContactSessionState = z.infer<typeof contactSessionStateSchema>;
export type ProcessedMessageState = z.infer<typeof processedMessageStateSchema>;
export type OutboundMessageState = z.infer<typeof outboundMessageStateSchema>;
export type AttachmentRecordState = z.infer<typeof attachmentRecordStateSchema>;
export type JobLogEntryState = z.infer<typeof jobLogEntryStateSchema>;
export type BackgroundJobState = z.infer<typeof backgroundJobStateSchema>;
export type BridgeState = z.infer<typeof bridgeStateSchema>;

function createContactState(contact: ContactConfig): ContactSessionState {
  return {
    handle: contact.handle,
    name: contact.name,
    workspace: contact.workspace,
    currentSessionId: null,
    sessions: []
  };
}

export function createInitialBridgeState(config: BridgeConfig): BridgeState {
  return {
    version: 3,
    contacts: config.contacts.map(createContactState),
    processedMessages: [],
    outboundMessages: [],
    attachments: [],
    nextJobSequence: 1,
    jobs: []
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
    return parseBridgeState(parsedJson);
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

function parseBridgeState(parsedJson: unknown): BridgeState {
  const parsedV3 = bridgeStateSchema.safeParse(parsedJson);

  if (parsedV3.success) {
    return parsedV3.data;
  }

  const parsedV2Schema = z
    .object({
      version: z.literal(2),
      contacts: z.array(contactSessionStateSchema),
      processedMessages: z.array(processedMessageStateSchema),
      outboundMessages: z.array(outboundMessageStateSchema),
      attachments: z.array(attachmentRecordStateSchema)
    })
    .safeParse(parsedJson);

  if (parsedV2Schema.success) {
    return {
      ...parsedV2Schema.data,
      version: 3,
      nextJobSequence: 1,
      jobs: []
    };
  }

  const parsedV1 = legacyBridgeStateSchema.safeParse(parsedJson);

  if (parsedV1.success) {
    return {
      version: 3,
      contacts: parsedV1.data.contacts.map((contact) => ({
        handle: contact.handle,
        name: contact.name,
        workspace: contact.workspace,
        currentSessionId: contact.threadId ? "session-1" : null,
        sessions: contact.threadId
          ? [
              {
                id: "session-1",
                name: "默认会话",
                workspace: contact.workspace,
                threadId: contact.threadId,
                lastActiveAt: contact.lastActiveAt,
                createdAt: contact.lastActiveAt ?? 0
              }
            ]
          : []
      })),
      processedMessages: parsedV1.data.processedMessages,
      outboundMessages: parsedV1.data.outboundMessages,
      attachments: parsedV1.data.attachments,
      nextJobSequence: 1,
      jobs: []
    };
  }

  throw parsedV3.error;
}

type SaveBridgeStateOptions = {
  path: string;
  state: BridgeState;
};

export async function saveBridgeState(options: SaveBridgeStateOptions): Promise<void> {
  const serializedState = JSON.stringify(
    bridgeStateSchema.parse(options.state),
    null,
    2
  );

  await mkdir(dirname(options.path), { recursive: true });
  await writeFileAtomically(options.path, `${serializedState}\n`);
}

async function writeFileAtomically(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;

  await writeFile(temporaryPath, content, "utf8");

  const fileHandle = await open(temporaryPath, "r");
  try {
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }

  await rename(temporaryPath, path);
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
