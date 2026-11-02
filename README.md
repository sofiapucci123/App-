# Progress

Turns yearly goals into monthly goals and daily tasks.

Stack: Next.js (App Router) + SQLite (better-sqlite3), email/password auth with bcrypt and httpOnly session cookies.

```
npm install
npm run build && npm start   # http://localhost:3000
```

The database file lives at `data/progress.db` (override with `DATABASE_PATH`). Schema: `lib/schema.sql`.

## Configuration

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for the AI breakdown (model `claude-opus-5-5`). |
| `DATABASE_PATH` | Where the SQLite file lives. On a host, point it at a persistent volume, e.g. `/data/progress.db`. |
| `PORT` | Port for `npm start` (defaults to 3000). |
| `PROGRESS_AI_MOCK` | Set to `1` in development only to use obviously labeled sample plans instead of calling the API. |
