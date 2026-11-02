# Progress

Turns yearly goals into monthly goals and daily tasks.

Stack: Next.js (App Router) + SQLite (better-sqlite3), email/password auth with bcrypt and httpOnly session cookies.

```
npm install
npm run build && npm start   # http://localhost:3000
```

The database file lives at `data/progress.db` (override with `DATABASE_PATH`). Schema: `lib/schema.sql`.
