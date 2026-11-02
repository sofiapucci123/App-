import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "progress.db");

declare global {
  // eslint-disable-next-line no-var
  var __progressDb: Database.Database | undefined;
}

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH, { timeout: 10000 });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}

// Reuse one connection across hot reloads in dev.
export const db: Database.Database = globalThis.__progressDb ?? (globalThis.__progressDb = open());
