-- Progress database schema. Every user-owned table carries user_id,
-- and every query in lib/ filters on it, so users only see their own data.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One row per user. Name is collected on onboarding screen 2.
CREATE TABLE IF NOT EXISTS profiles (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT,
  third_person      INTEGER NOT NULL DEFAULT 1,
  target_date       TEXT,              -- YYYY-MM-DD, default 12 months out
  reminder_time     TEXT,              -- HH:MM, optional
  onboarding_step   INTEGER NOT NULL DEFAULT 1,
  plan_confirmed_at TEXT
);

-- Yearly goals, each with its "why".
CREATE TABLE IF NOT EXISTS goals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  why        TEXT NOT NULL DEFAULT '',
  kind       TEXT CHECK (kind IN ('habit','project')),
  position   INTEGER NOT NULL DEFAULT 0,
  edited     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

-- One monthly goal per yearly goal per month.
CREATE TABLE IF NOT EXISTS monthly_goals (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id  INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  month    TEXT NOT NULL,              -- YYYY-MM
  text     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  edited   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_monthly_user_month ON monthly_goals(user_id, month);

-- A daily task series: the same task recurring over a date range
-- (habits), or a single-day action step (projects, start = end).
CREATE TABLE IF NOT EXISTS tasks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id         INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  monthly_goal_id INTEGER REFERENCES monthly_goals(id) ON DELETE SET NULL,
  text            TEXT NOT NULL,
  start_date      TEXT NOT NULL,       -- YYYY-MM-DD
  end_date        TEXT NOT NULL,       -- YYYY-MM-DD, inclusive
  edited          INTEGER NOT NULL DEFAULT 0,
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_dates ON tasks(user_id, start_date, end_date);

-- Per-day state of a task: completion, missed, one-day text edits, reschedules.
CREATE TABLE IF NOT EXISTS task_days (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id          INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date             TEXT NOT NULL,      -- YYYY-MM-DD
  text_override    TEXT,               -- "this day only" edit
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','missed','skipped')),
  completed_at     TEXT,
  rescheduled_to   TEXT,               -- date a missed task was moved to
  deleted_at       TEXT,
  UNIQUE (task_id, date)
);
CREATE INDEX IF NOT EXISTS idx_task_days_user_date ON task_days(user_id, date);

-- Monthly reviews written by the AI and approved by the user.
CREATE TABLE IF NOT EXISTS monthly_reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,           -- the month being reviewed
  summary     TEXT NOT NULL,
  approved_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, month)
);
