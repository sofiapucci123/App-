# Progress

Turns yearly goals into monthly goals and daily tasks.

Stack: Next.js (App Router) + SQLite via libSQL (a local file in development, Turso when hosted), email/password auth with bcrypt and httpOnly session cookies.

```
npm install
npm run build && npm start   # http://localhost:3000
```

Locally the database is a file at `data/progress.db`. Schema: `lib/schema.ts` (created automatically on first run).

## Configuration

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for the AI breakdown (model `claude-opus-5-5`). |
| `DATABASE_URL` | Hosted database URL, e.g. `libsql://progress-yourname.turso.io`. Leave unset to use the local file. |
| `DATABASE_AUTH_TOKEN` | Turso database token. |
| `DATABASE_PATH` | Local SQLite file path when `DATABASE_URL` is unset (default `data/progress.db`). |
| `PORT` | Port for `npm start` (defaults to 3000). |
| `PROGRESS_AI_MOCK` | Set to `1` in development only to use obviously labeled sample plans instead of calling the API. |

## Free hosting (Vercel + Turso)

1. Create a free database at turso.tech, then copy its URL and a token.
2. Import this repo at vercel.com/new.
3. In the Vercel project settings, add `DATABASE_URL`, `DATABASE_AUTH_TOKEN` and `ANTHROPIC_API_KEY`, then redeploy.
