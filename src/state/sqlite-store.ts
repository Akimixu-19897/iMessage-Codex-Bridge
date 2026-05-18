import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { SQLITE_SCHEMA, SQLITE_STATE_TABLES } from "./sqlite-schema.js";
import { bridgeStateSchema, type BridgeState } from "./state-store.js";

type SqliteDatabase = Database.Database;

type ContactRow = {
  handle: string;
  name: string;
  workspace: string;
  current_session_id: string | null;
};

type SessionRow = {
  handle: string;
  id: string;
  name: string;
  workspace: string;
  thread_id: string | null;
  last_active_at: number | null;
  created_at: number;
};

type JobRow = {
  id: string;
  handle: string;
  session_id: string | null;
  mode: "foreground" | "background";
  workflow: "generic" | "autoresearch";
  prompt: string;
  title: string;
  source_message_ids: string;
  attachment_paths: string;
  status: BridgeState["jobs"][number]["status"];
  created_at: number;
  acknowledged_at: number | null;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
  current_stage: string | null;
  summary: string | null;
  error_message: string | null;
  thread_id: string | null;
  turn_id: string | null;
  last_heartbeat_at: number | null;
  next_heartbeat_at: number | null;
  slow_notice_sent_at: number | null;
};

type JobLogRow = {
  job_id: string;
  at: number;
  message: string;
};

type AttachmentRow = {
  message_id: string;
  handle: string;
  thread_id: string | null;
  source_path: string;
  staged_path: string;
  created_at: number;
};

type ProcessedMessageRow = {
  message_id: string;
  handle: string;
  received_at: number;
  processed_at: number;
};

type OutboundMessageRow = {
  message_id: string;
  handle: string;
  sent_at: number;
};

type MetadataRow = {
  key: string;
  value: string;
};

export function openSqliteDatabase(databasePath: string): SqliteDatabase {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  return database;
}

export function initializeSqliteStore(databasePath: string): SqliteDatabase {
  const database = openSqliteDatabase(databasePath);
  const initialize = database.transaction(() => {
    for (const statement of SQLITE_SCHEMA) {
      database.exec(statement);
    }
  });
  initialize();
  return database;
}

export function hasSqliteBridgeState(database: SqliteDatabase): boolean {
  const row = database.prepare("SELECT COUNT(*) AS count FROM contacts").get() as {
    count: number;
  };
  const metadata = database
    .prepare("SELECT value FROM metadata WHERE key = ?")
    .get("next_job_sequence") as MetadataRow | undefined;
  return row.count > 0 || metadata !== undefined;
}

export function clearSqliteBridgeState(database: SqliteDatabase): void {
  const clear = database.transaction(() => {
    for (const table of [...SQLITE_STATE_TABLES].reverse()) {
      database.prepare(`DELETE FROM ${table}`).run();
    }
  });
  clear();
}

export function writeBridgeStateToSqlite(
  database: SqliteDatabase,
  state: BridgeState
): void {
  const parsedState = bridgeStateSchema.parse(state);
  const write = database.transaction(() => {
    clearSqliteBridgeState(database);

    const insertContact = database.prepare(
      `INSERT INTO contacts (
        handle, name, workspace, current_session_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertSession = database.prepare(
      `INSERT INTO sessions (
        handle, id, name, workspace, thread_id, last_active_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertJob = database.prepare(
      `INSERT INTO jobs (
        id, handle, session_id, mode, workflow, prompt, title,
        source_message_ids, attachment_paths, status, created_at, acknowledged_at,
        updated_at, started_at, finished_at, current_stage, summary, error_message,
        thread_id, turn_id, last_heartbeat_at, next_heartbeat_at, slow_notice_sent_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertJobLog = database.prepare(
      "INSERT INTO job_logs (job_id, at, message) VALUES (?, ?, ?)"
    );
    const insertAttachment = database.prepare(
      `INSERT INTO attachments (
        message_id, handle, thread_id, source_path, staged_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const insertProcessedMessage = database.prepare(
      `INSERT INTO processed_messages (
        message_id, handle, received_at, processed_at
      ) VALUES (?, ?, ?, ?)`
    );
    const insertOutboundMessage = database.prepare(
      "INSERT INTO outbound_messages (message_id, handle, sent_at) VALUES (?, ?, ?)"
    );
    const insertMetadata = database.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?)"
    );

    for (const contact of parsedState.contacts) {
      const contactCreatedAt =
        contact.sessions[0]?.createdAt ?? contact.sessions[0]?.lastActiveAt ?? 0;
      const contactUpdatedAt =
        contact.sessions[0]?.lastActiveAt ?? contact.sessions[0]?.createdAt ?? 0;
      insertContact.run(
        contact.handle,
        contact.name,
        contact.workspace,
        contact.currentSessionId,
        contactCreatedAt,
        contactUpdatedAt
      );

      for (const session of contact.sessions) {
        insertSession.run(
          contact.handle,
          session.id,
          session.name,
          session.workspace,
          session.threadId,
          session.lastActiveAt,
          session.createdAt
        );
      }
    }

    for (const job of parsedState.jobs) {
      insertJob.run(
        job.id,
        job.handle,
        job.sessionId,
        job.mode,
        job.workflow,
        job.prompt,
        job.title,
        JSON.stringify(job.sourceMessageIds),
        JSON.stringify(job.attachmentPaths),
        job.status,
        job.createdAt,
        job.acknowledgedAt,
        job.updatedAt,
        job.startedAt,
        job.finishedAt,
        job.currentStage,
        job.summary,
        job.errorMessage,
        job.threadId,
        job.turnId,
        job.lastHeartbeatAt,
        job.nextHeartbeatAt,
        job.slowNoticeSentAt
      );

      for (const log of job.logs) {
        insertJobLog.run(job.id, log.at, log.message);
      }
    }

    for (const attachment of parsedState.attachments) {
      insertAttachment.run(
        attachment.messageId,
        attachment.handle,
        attachment.threadId,
        attachment.sourcePath,
        attachment.stagedPath,
        attachment.createdAt
      );
    }

    for (const message of parsedState.processedMessages) {
      insertProcessedMessage.run(
        message.messageId,
        message.handle,
        message.receivedAt,
        message.processedAt
      );
    }

    for (const message of parsedState.outboundMessages) {
      insertOutboundMessage.run(message.messageId, message.handle, message.sentAt);
    }

    insertMetadata.run("next_job_sequence", String(parsedState.nextJobSequence));
  });
  write();
}

export function replaceSqliteJobs(
  database: SqliteDatabase,
  jobs: BridgeState["jobs"],
  nextJobSequence?: number
): void {
  const replace = database.transaction(() => {
    database.prepare("DELETE FROM job_logs").run();
    database.prepare("DELETE FROM jobs").run();
    insertJobs(database, jobs);

    if (nextJobSequence !== undefined) {
      database
        .prepare(
          `INSERT INTO metadata (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run("next_job_sequence", String(nextJobSequence));
    }
  });
  replace();
}

export function upsertSqliteJob(
  database: SqliteDatabase,
  job: BridgeState["jobs"][number],
  nextJobSequence?: number
): void {
  const upsert = database.transaction(() => {
    database.prepare("DELETE FROM job_logs WHERE job_id = ?").run(job.id);
    database.prepare("DELETE FROM jobs WHERE id = ?").run(job.id);
    insertJobs(database, [job]);

    if (nextJobSequence !== undefined) {
      database
        .prepare(
          `INSERT INTO metadata (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run("next_job_sequence", String(nextJobSequence));
    }
  });
  upsert();
}

export function readBridgeStateFromSqlite(database: SqliteDatabase): BridgeState {
  const contacts = (
    database.prepare("SELECT * FROM contacts ORDER BY rowid ASC").all() as ContactRow[]
  ).map((contact) => ({
    handle: contact.handle,
    name: contact.name,
    workspace: contact.workspace,
    currentSessionId: contact.current_session_id,
    sessions: (
      database
        .prepare("SELECT * FROM sessions WHERE handle = ? ORDER BY rowid ASC")
        .all(contact.handle) as SessionRow[]
    ).map((session) => ({
      id: session.id,
      name: session.name,
      workspace: session.workspace,
      threadId: session.thread_id,
      lastActiveAt: session.last_active_at,
      createdAt: session.created_at
    }))
  }));

  const logsByJobId = new Map<string, JobLogRow[]>();
  for (const log of database
    .prepare("SELECT * FROM job_logs ORDER BY id ASC")
    .all() as JobLogRow[]) {
    const logs = logsByJobId.get(log.job_id) ?? [];
    logs.push(log);
    logsByJobId.set(log.job_id, logs);
  }

  const jobs = (
    database.prepare("SELECT * FROM jobs ORDER BY rowid ASC").all() as JobRow[]
  ).map((job) => ({
    id: job.id,
    handle: job.handle,
    sessionId: job.session_id,
    mode: job.mode,
    workflow: job.workflow,
    prompt: job.prompt,
    title: job.title,
    sourceMessageIds: parseStringArray(job.source_message_ids),
    attachmentPaths: parseStringArray(job.attachment_paths),
    status: job.status,
    createdAt: job.created_at,
    acknowledgedAt: job.acknowledged_at,
    updatedAt: job.updated_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    currentStage: job.current_stage,
    summary: job.summary,
    errorMessage: job.error_message,
    threadId: job.thread_id,
    turnId: job.turn_id,
    lastHeartbeatAt: job.last_heartbeat_at,
    nextHeartbeatAt: job.next_heartbeat_at,
    slowNoticeSentAt: job.slow_notice_sent_at,
    logs: (logsByJobId.get(job.id) ?? []).map((log) => ({
      at: log.at,
      message: log.message
    }))
  }));

  const processedMessages = (
    database
      .prepare("SELECT * FROM processed_messages ORDER BY rowid ASC")
      .all() as ProcessedMessageRow[]
  ).map((message) => ({
    messageId: message.message_id,
    handle: message.handle,
    receivedAt: message.received_at,
    processedAt: message.processed_at
  }));

  const outboundMessages = (
    database
      .prepare("SELECT * FROM outbound_messages ORDER BY rowid ASC")
      .all() as OutboundMessageRow[]
  ).map((message) => ({
    messageId: message.message_id,
    handle: message.handle,
    sentAt: message.sent_at
  }));

  const attachments = (
    database
      .prepare("SELECT * FROM attachments ORDER BY rowid ASC")
      .all() as AttachmentRow[]
  ).map((attachment) => ({
    messageId: attachment.message_id,
    handle: attachment.handle,
    threadId: attachment.thread_id,
    sourcePath: attachment.source_path,
    stagedPath: attachment.staged_path,
    createdAt: attachment.created_at
  }));

  const nextJobSequenceRow = database
    .prepare("SELECT value FROM metadata WHERE key = ?")
    .get("next_job_sequence") as MetadataRow | undefined;

  return bridgeStateSchema.parse({
    version: 3,
    contacts,
    processedMessages,
    outboundMessages,
    attachments,
    nextJobSequence: Number(nextJobSequenceRow?.value ?? 1),
    jobs
  });
}

function insertJobs(database: SqliteDatabase, jobs: BridgeState["jobs"]): void {
  const insertJob = database.prepare(
    `INSERT INTO jobs (
      id, handle, session_id, mode, workflow, prompt, title,
      source_message_ids, attachment_paths, status, created_at, acknowledged_at,
      updated_at, started_at, finished_at, current_stage, summary, error_message,
      thread_id, turn_id, last_heartbeat_at, next_heartbeat_at, slow_notice_sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertJobLog = database.prepare(
    "INSERT INTO job_logs (job_id, at, message) VALUES (?, ?, ?)"
  );

  for (const job of jobs) {
    insertJob.run(
      job.id,
      job.handle,
      job.sessionId,
      job.mode,
      job.workflow,
      job.prompt,
      job.title,
      JSON.stringify(job.sourceMessageIds),
      JSON.stringify(job.attachmentPaths),
      job.status,
      job.createdAt,
      job.acknowledgedAt,
      job.updatedAt,
      job.startedAt,
      job.finishedAt,
      job.currentStage,
      job.summary,
      job.errorMessage,
      job.threadId,
      job.turnId,
      job.lastHeartbeatAt,
      job.nextHeartbeatAt,
      job.slowNoticeSentAt
    );

    for (const log of job.logs) {
      insertJobLog.run(job.id, log.at, log.message);
    }
  }
}

function parseStringArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`SQLite 数组字段无效: ${value}`);
  }
  return parsed;
}
