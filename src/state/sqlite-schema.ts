export const SQLITE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS contacts (
    handle TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    workspace TEXT NOT NULL,
    current_session_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    handle TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    workspace TEXT NOT NULL,
    thread_id TEXT,
    last_active_at INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (handle, id),
    FOREIGN KEY (handle) REFERENCES contacts(handle) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    session_id TEXT,
    mode TEXT NOT NULL,
    workflow TEXT NOT NULL,
    prompt TEXT NOT NULL,
    title TEXT NOT NULL,
    source_message_ids TEXT NOT NULL,
    attachment_paths TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    acknowledged_at INTEGER,
    updated_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    current_stage TEXT,
    summary TEXT,
    error_message TEXT,
    thread_id TEXT,
    turn_id TEXT,
    last_heartbeat_at INTEGER,
    next_heartbeat_at INTEGER,
    slow_notice_sent_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    message TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    message_id TEXT NOT NULL,
    handle TEXT NOT NULL,
    thread_id TEXT,
    source_path TEXT NOT NULL,
    staged_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, staged_path)
  )`,
  `CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outbound_messages (
    message_id TEXT PRIMARY KEY,
    handle TEXT NOT NULL,
    sent_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`
] as const;

export const SQLITE_STATE_TABLES = [
  "contacts",
  "sessions",
  "jobs",
  "job_logs",
  "attachments",
  "processed_messages",
  "outbound_messages",
  "metadata"
] as const;
