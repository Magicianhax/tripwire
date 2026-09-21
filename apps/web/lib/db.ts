import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

let db: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.TRIPWIRE_DB ?? path.join(process.cwd(), ".data", "tripwire.db");
}

/**
 * The install id every row carried before the backend could be hosted, and the one a self-hosted
 * backend keeps using.
 *
 * The schema was implicitly single-user: one machine, one database, so "whose rules are these?"
 * had one answer and needed no column. Hosting breaks that, and the migration has to give the
 * rows that already exist an owner or a self-hoster's saved rules and history quietly vanish on
 * upgrade. That owner is this constant, and a backend with `TRIPWIRE_HOSTED` unset keeps writing
 * under it, so nothing about the local experience changes.
 */
export const SELF_HOST_INSTALL = "self";

function columns(d: DatabaseSync, table: string): Set<string> {
  const rows = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

/** True when `table` exists; PRAGMA on a missing table returns no rows rather than throwing. */
function tableExists(d: DatabaseSync, table: string): boolean {
  return columns(d, table).size > 0;
}

/**
 * Adds the `install` column to a log table that did not have one, defaulting every existing row
 * to the self-host id. Append-only logs can take `ALTER TABLE … ADD COLUMN` because their primary
 * key is a rowid and does not change; the two tables keyed by content (`settings`, `wallet_links`)
 * cannot, and are rebuilt below.
 */
function addInstallColumn(d: DatabaseSync, table: string) {
  if (!tableExists(d, table) || columns(d, table).has("install")) return;
  d.exec(`ALTER TABLE ${table} ADD COLUMN install TEXT NOT NULL DEFAULT '${SELF_HOST_INSTALL}'`);
}

/**
 * Rebuilds a table whose primary key has to widen to include `install`. SQLite cannot alter a
 * primary key in place, so this is the documented create-copy-drop-rename dance, wrapped in a
 * transaction: a half-applied migration would leave the backend with no rules table at all.
 */
function rebuildWithInstall(d: DatabaseSync, table: string, create: string, copyColumns: string) {
  if (tableExists(d, table) && columns(d, table).has("install")) return;
  const existed = tableExists(d, table);
  d.exec("BEGIN");
  try {
    if (existed) d.exec(`ALTER TABLE ${table} RENAME TO ${table}_pre_install`);
    d.exec(create);
    if (existed) {
      d.exec(
        `INSERT INTO ${table} (install, ${copyColumns}) SELECT '${SELF_HOST_INSTALL}', ${copyColumns} FROM ${table}_pre_install`,
      );
      d.exec(`DROP TABLE ${table}_pre_install`);
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const file = dbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    -- Shared by every install on purpose. A hosted backend's cache is what makes hosting
    -- affordable: the hundredth person to check a token inside its TTL pays nothing, because the
    -- first person already did. Adding an install column here would delete the economics.
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
    CREATE TABLE IF NOT EXISTS settings_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      from_preset TEXT NOT NULL,
      to_preset TEXT NOT NULL,
      rule_ids TEXT NOT NULL
    );
    -- One row per extension install. The token is the only identity the backend has: no account,
    -- no email, nothing that survives a reinstall. It exists to rate-limit spending, not to know
    -- who anyone is.
    CREATE TABLE IF NOT EXISTS installs (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    -- Counts mints per address per day so one script cannot defeat the per-install cap by minting
    -- a token per request. The address itself is never stored: ip_bucket is a salted hash,
    -- because a bare hash of the 2^32 IPv4 space is a lookup table, not an anonymisation.
    CREATE TABLE IF NOT EXISTS install_mints (
      ip_bucket TEXT NOT NULL,
      day INTEGER NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS install_mints_bucket_day ON install_mints(ip_bucket, day);
  `);

  addInstallColumn(db, "ledger");
  addInstallColumn(db, "checks");
  addInstallColumn(db, "overrides");
  addInstallColumn(db, "settings_changes");

  rebuildWithInstall(
    db,
    "settings",
    `CREATE TABLE settings (
      install TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (install, key)
    )`,
    "key, value",
  );
  rebuildWithInstall(
    db,
    "wallet_links",
    `CREATE TABLE wallet_links (
      install TEXT NOT NULL,
      handle TEXT NOT NULL,
      venue TEXT NOT NULL CHECK (venue IN ('hyperliquid', 'polymarket')),
      address TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('user', 'curated')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (install, handle, venue)
    )`,
    "handle, venue, address, source, created_at",
  );

  db.exec(`
    CREATE INDEX IF NOT EXISTS ledger_install_ts ON ledger(install, ts);
    CREATE INDEX IF NOT EXISTS checks_install_id ON checks(install, id);
    CREATE INDEX IF NOT EXISTS overrides_install_id ON overrides(install, id);
    CREATE INDEX IF NOT EXISTS settings_changes_install_id ON settings_changes(install, id);
  `);
  return db;
}

/** Test helper: drop the singleton so a new TRIPWIRE_DB takes effect. */
export function resetDb() {
  db?.close();
  db = null;
}
