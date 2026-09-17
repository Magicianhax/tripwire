import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

let db: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.TRIPWIRE_DB ?? path.join(process.cwd(), ".data", "tripwire.db");
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = dbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      stored_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      status INTEGER NOT NULL,
      credits REAL,
      latency_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ledger_ts ON ledger(ts);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      venue TEXT NOT NULL,
      target TEXT NOT NULL,
      verdict TEXT NOT NULL,
      signals TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      venue TEXT NOT NULL,
      target TEXT NOT NULL,
      verdict TEXT NOT NULL,
      rule_ids TEXT NOT NULL
    );
  `);
  return db;
}

/** Test helper: drop the singleton so a new TRIPWIRE_DB takes effect. */
export function resetDb() {
  db?.close();
  db = null;
}
