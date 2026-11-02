import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";
import { SCHEMA } from "./schema";

// Local development uses a SQLite file. In production, set DATABASE_URL (e.g. libsql://….turso.io)
// and DATABASE_AUTH_TOKEN to use a hosted Turso database.
const url = process.env.DATABASE_URL || `file:${process.env.DATABASE_PATH || "data/progress.db"}`;

declare global {
  // eslint-disable-next-line no-var
  var __progressDb: { client: Client; ready: Promise<void> } | undefined;
}

function open() {
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const ready = (async () => {
    if (url.startsWith("file:")) {
      const fs = await import("node:fs");
      const path = await import("node:path");
      fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
      await client.execute("PRAGMA journal_mode = WAL");
      await client.execute("PRAGMA busy_timeout = 10000");
    }
    await client.execute("PRAGMA foreign_keys = ON");
    await client.executeMultiple(SCHEMA);
    await migrate(client);
  })();
  return { client, ready };
}

// Columns added after the first release. CREATE TABLE IF NOT EXISTS won't add them to existing databases.
async function migrate(client: Client) {
  const addColumn = async (table: string, column: string, ddl: string) => {
    const cols = (await client.execute(`PRAGMA table_info(${table})`)).rows;
    if (!cols.some((c) => c.name === column)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };
  await addColumn("goals", "third_person", "third_person INTEGER NOT NULL DEFAULT 0");
}

const conn = (globalThis.__progressDb ??= open());

export type Exec = Client | Transaction;

async function exec(sql: string, args: InArgs = [], tx?: Exec) {
  await conn.ready;
  return (tx ?? conn.client).execute({ sql, args });
}

/** All rows of a query. */
export async function all<T>(sql: string, args: InArgs = [], tx?: Exec): Promise<T[]> {
  return toObjects<T>(await exec(sql, args, tx));
}

// libSQL rows are array-like; turn them into plain objects so they serialize cleanly to client components.
function toObjects<T>(r: { columns: string[]; rows: ArrayLike<unknown>[] }): T[] {
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])) as T);
}

/** First row of a query, or undefined. */
export async function get<T>(sql: string, args: InArgs = [], tx?: Exec): Promise<T | undefined> {
  return toObjects<T>(await exec(sql, args, tx))[0];
}

/** Runs a write and returns the new row id (for inserts) and the number of rows changed. */
export async function run(sql: string, args: InArgs = [], tx?: Exec) {
  const r = await exec(sql, args, tx);
  return { id: r.lastInsertRowid === undefined ? 0 : Number(r.lastInsertRowid), changes: r.rowsAffected };
}

/** Runs `fn` inside a write transaction; rolls back if it throws. */
export async function transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  await conn.ready;
  const tx = await conn.client.transaction("write");
  try {
    const out = await fn(tx);
    await tx.commit();
    return out;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
}
